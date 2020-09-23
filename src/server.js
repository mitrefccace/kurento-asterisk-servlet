
// Imports of internal dependencies.
const config = require('./configuration.js');
const registry = require('./registry.js');
const users = require('./sipUsers.js');
const redisManager = require('./redis-manager.js');
const upload = require('./upload.js');

// Imports of external dependencies.
const crypto = require('crypto');
const Kurento = require('kurento-client');
const NodeWS = require('jssip-node-websocket');
const SDES = Kurento.getComplexType('SDES');
const SDP = require('sdp-transform');
const SIP = require('jssip');

// Definition of global variables.
var userRegistry = new registry.UserRegistry();
var sipUserPool = new users.SipUserPool();
var kurentoClient = null;
var redis = new redisManager.RedisManager();
var uploadVideomail = new upload.UploadVideomail();

// Definition of helper class to represent callee session.
function UserSession(ext, pass, ua) {
    // Username and Password
    this.ext = ext;
    this.pass = pass;

    // JSSIP objects
    this.ua = ua;
    this.session = null;

    // Call Info
    this.incomingCaller = null;
    this.incomingExtension = null;
    this.sdpOffer = null;
    this.sdpAnswer = null;
    this.recordingFile = null;

    // Kurento
    this.pipeline = null;
    this.rtpEndpoint = null;
    this.recorderEndpoint = null;
    this.incomingMediaProfile = null;
}

// Set up redis
redis.init();

// ---- Start the program! -----
// This spawns a JSSIP UA that listens for an incoming call.
var user = sipUserPool.getSipUser();
register(user.sipId, user.sipPass);

// ********************** METHOD DEFINITIONS ********************************


// Spawns a JSSIP UA to listen for incoming cals.
// All JSSIP event handlers are defined here.
function register(ext, password) {
    debuglog("Starting...");

    function onError(error) {
        debuglog(JSON.stringify({ id: 'registerResponse', response: 'rejected ', message: error }));
    }

    if (!ext) {
        return onError("empty user ext");
    }

    if (userRegistry.getByExt(ext)) {
        return onError("Server user " + ext + " is already registered");
    }

    // Make a JSSIP User Agent (UA) to handle SIP messaging.
    var uri = `wss://${config.sipServer}:${config.sipWsPort}/ws`;
    debuglog("Websocket to: " + uri);
    var socket = new NodeWS(uri, {
        requestOptions:
        {
            ciphers: "ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384",
        }
    });

    // JSSIP UA Configuration
    var configuration = {
        sockets: [socket],
        uri: `sip:${ext}@${config.sipServer}`,
        password,
        registrar_server: `sip:${config.sipServer}`,
        register: true,
        rtc: () => ({
            //Do nothing, required by WebRTCVentures Library Modifications
        })
    };
    debuglog("Registering to: " + configuration.uri);
    var userAgent = new SIP.UA(configuration);
    userAgent.start();

    // Register them to our local user registry
    userRegistry.register(new UserSession(ext, password, userAgent));

    // --------------------- EVENT HANDLERS FOR JSSIP UA -----------------------
    // Event Handler: Registered successfully.
    userAgent.on('registered', () => {
        log(ext, 'SIP UA registered.');
        debuglog(`-- UA registration status: ${userAgent.isRegistered()}`)
        debuglog(`-- UA connection status: ${userAgent.isConnected()}`)
        debuglog("Next available in pool: " + sipUserPool.clients.peek().sipId);
    });

    // Event Handler: Registration failed.
    userAgent.on('registrationFailed', () => {
        debuglog(`SIP client could not be registered for ${ext}`);
        stopAndExit(-1, ext, "SIP Registration Failed");
    });

    // Event Handler: The SIP UA has disconnected.
    userAgent.on('disconnect', function () {
        debuglog(`${ext} user agent disconnected`);
        stopCall(-2, ext, "SIP UA Disconnected Unexpectedly");
    });

    // Event Handler: A new call invite has been received.
    userAgent.on('newRTCSession', (data) => {
        // Make a new user for next session!
        var newUser = sipUserPool.getSipUser();
        register(newUser.sipId, newUser.sipPass);
        debuglog("Available in pool: " + sipUserPool.clients.peek().sipId);
        newIncomingCall(ext, data);
    });
    // ------------------- END EVENT HANDLERS (JSSIP UA) -------------------------------
}


// Initialize an incoming call!
// Event handlers for RTC session

function newIncomingCall(ext, data) {
    log(ext, 'Initial invite received');

    let callee = userRegistry.getByExt(ext);

    // Store info on incoming call 
    let vrsTemp = data.request.from.uri.user;
    callee.incomingCaller = vrsTemp;
    callee.incomingExtension = vrsTemp
    let regex = RegExp('9900[1-5]');
    if (regex.test(vrsTemp)) {
        console.log("WebRTC 9900X extension detected, attempt redis look up.")
        Promise.resolve(redis.vrsLookup(vrsTemp)).then((value) => {
            debuglog("Redis map extension", vrsTemp, "to", value)
            callee.incomingCaller = value;
        }).catch(() => {
            debuglog("Redis Error: Occured during vrs to extension lookup.")
        })
    }

    callee.session = data.session;

    // Automatically answer incoming calls.
    // Constructs a Kurento pipeline, then uses to Kurento to generate a
    // response SDP for the JSSIP Session to send back.
    connectIncomingCall(ext, data.request.body, function (error) {
        if (error) {
            debuglog('connectIncomingCall received error: ' + error);
        }
        else {
            // KMS has succesfully started a pipeline and generated a return SDP.
            // Here we send that return SDP back to the caller.
            var options = {
                rtcAnswerConstraints: callee.sdpAnswer
            };
            callee.session.answer(options);	
	    debuglog('Initial call processed.'); //At this point, we are just waiting for events to trigger.
        }
    });


    // --------------------- EVENT HANDLERS FOR JSSIP RTCSESSION -----------------------
    // Event Handler: A reinvite has been received.
    callee.session.on('reinvite', (data) => {
        debuglog('Reinvite received, automatically responding.');
        callee.session.respondReinvite();
    });

    // Triggers when the RTCSession is ended, and shuts down the program.
    callee.session.on('ended', () => {
        log(ext, 'SIP Conversation ended.');
	clearTimeout(callee.hangupTimer);
        // Wait for the recorder to stop gracefully
        if (callee.recorderEndpoint) {
            callee.recorderEndpoint.stopAndWait().then(function (error) {
                if (error) {
                    debuglog('Error stopping recorder!');
                    stopCall(-3, ext, "Error Stopping Recorder");
                }
                debuglog('Recording stopped.');
                uploadVideomail.post(callee);
            });
        } else {
            uploadVideomail.post(callee);
        }
        stopCall(0, ext, null);
    });
    // -------------------- END EVENT HANDLERS (JSSIP RTCSession) ----------------------------
}

/*
 * Connects the incoming call to KMS.  Performs several important functions:
 * 		- Creates the media pipeline
 *		- Creates the endpoints, a RtpEndpoint, a Recorder Endpoint, and the PlayerEndpoint(s)
 *		- Connects the endpoints
 *		- Uses the RtpEndpoint and the KMS to process the incoming SDP offer and generate an answer SDP.
 			- NOTE: this process also configures the RtpEndpoint.
 *		- Starts the recorder recording.
 *		- CONTAINS EVENT HANDLERS FOR ALL ENDPOINTS.
 */
function connectIncomingCall(ext, sdpOffer, callback) {
    // If this fails, then we could not access the KMS.
    debuglog("Trying to initate connection to Kurento Media Server...");
    getKurentoClient(function (error, kurentoClient) {
        if (error) {
            return callback(error);
        }
        debuglog('Got Kurento Client (succesfully connected to KMS)');

        // First we create the pipeline.
        kurentoClient.create('MediaPipeline', function (error, pipeline) {
            if (error) {
                return callback(error);
            }

            // Pipeline creation successful, save to field.
            var callee = userRegistry.getByExt(ext);
            callee.pipeline = pipeline;

            // Check the incoming sdp to determine the correct incomingMediaProfile
            callee.incomingMediaProfile = 'WEBM_VIDEO_ONLY';//getMediaProfile(sdpOffer, ext);
            log(callee.ext, "Detected Incoming Media Profile: " + callee.incomingMediaProfile);

            // Create the Endpoints.
            createMediaElements(ext, pipeline, function (error, rtpEndpoint, recorderEndpoint, playerEndpoint, playerEndpointRec) {
                if (error) {
                    return callback(error);
                }

                //Register to the User object.
                callee.rtpEndpoint = rtpEndpoint;
                callee.recorderEndpoint = recorderEndpoint;

                //Set Event Handlers for RtpEndpoint
                rtpEvents(callee, rtpEndpoint, recorderEndpoint, playerEndpoint);
                //Set Event Handlers for RecorderEndpoint
                recorderEvents(callee, recorderEndpoint, rtpEndpoint, playerEndpoint, playerEndpointRec);

                // Call the function to connect the media components (endpoints).
                connectMediaElements(rtpEndpoint, recorderEndpoint, playerEndpoint, function (error) {
                    if (error) {
                        pipeline.release();
                        return callback(error);
                    }

                    // Now the endpoints are connected!
                    debuglog("Offer SDP:\n" + sdpOffer);

                    //The user doesn't actually use this again, but it can't hurt to store it.
                    callee.sdpOffer = sdpOffer;

                    //Use the RtpEndpoint to process the recieved offer, configuring the endpoint in the process.
                    rtpEndpoint.processOffer(sdpOffer, function (error, sdpAnswer) {
                        if (error) {
                            debuglog('CIC error 5');
                            pipeline.release();
                            return callback(error);
                        }

                        callee.sdpAnswer = sdpAnswer;
                        debuglog('Answer SDP:\n' + callee.sdpAnswer);

                        return callback(null, sdpAnswer);
                    });
                });
            });
        });
    });
}

/*
 * Define the Event Handlers for the RTP Events.  Most just print out
 * info for debugging, but some trigger important things.
 *
 * |    Important Event     | Required Value |                    Effect                     |
 * |------------------------|----------------|-----------------------------------------------|
 * | ConnectionStateChanged | none           | Begin video playback from playerEndpoint |
 * | MediaStateChanged      | CONNECTED      | Begin recording with recorderEndpoint         |
 */
function rtpEvents(callee, rtpEndpoint, recorderEndpoint, playerEndpoint) {
    let body = `<?xml version="1.0" encoding="utf-8" ?>
            <media_control>
              <vc_primitive>
                <to_encoder>
                  <picture_fast_update/>
                </to_encoder>
              </vc_primitive>
            </media_control>`;

    rtpEndpoint.on('ConnectionStateChanged', () => {
        debuglog("RTPEndpoint: Connection state changed!");
        startPlayerEndpoint(playerEndpoint);
    });


    rtpEndpoint.on('MediaStateChanged', (state) => {
        callee.session.sendInfo('application/media_control+xml', body);
    });

    playerEndpoint.on('EndOfStream', () => {
        debuglog("Endpoint Has finished playing video file. Start Recording");
        callee.session.sendInfo('application/media_control+xml', body);



if(callee.incomingExtension != callee.incomingCaller){
        var eventHandlers = {
          'succeeded': function (e) { console.log('PASSED ' + JSON.stringify(e)) },
          'failed': function (e) { console.log('FAILED ' + JSON.stringify(e)) }
        };

        var options = {
          'eventHandlers': eventHandlers
        };

        callee.ua.sendMessage(callee.incomingExtension, 'STARTRECORDING', options);
        }

	recorderEndpoint.record().then(() => {
            log(callee.ext, "---Starting recorder---");
            callee.session.sendInfo('application/media_control+xml', body);
        });
    });

    rtpEndpoint.on('MediaFlowInStateChange', (param) => {
        debuglog('RTPEndpoint: MediaFlowInStateChange: ' + param.state);
        callee.session.sendInfo('application/media_control+xml', body);
    });

}

/*
 * Define the Event Handlers for the Recorder's Events.  
 *
 * The 'Recording' event is when VIDEO starts being recorded!
 *      As a result, it triggers the switch from the currentPlayerEndpoint
 *      to the Loopback, to visually inform the user that they are being recorded.
 */
function recorderEvents(callee, recorderEndpoint, rtpEndpoint, currentPlayerEndpoint, playerEndpointDuringRec) {
    recorderEndpoint.on('Recording', () => {
        log(callee.ext, "Recorder: Started Successfully.");
        currentPlayerEndpoint.stop();
        switchPlayers(rtpEndpoint, currentPlayerEndpoint, playerEndpointDuringRec, () => {
            startPlayerEndpoint(playerEndpointDuringRec)
            log(callee.ext, "Recorder: Recording now.");
	    callee.hangupTimer = setTimeout(function(){callee.session.terminate();},config.recordLength * 1000);
        });
    });

    recorderEndpoint.on('Stopped', () => {
        debuglog("Recorder: Stopped");
	clearTimeout(callee.hangupTimer);
    });
}

/*
 * Stop everything and exit the program in a somewhat graceful fashion.
 *
 * If exitCode < 0, this was an erroneous exit.
 */
function stopAndExit(exitCode, ext, reason) {
    if (exitCode < 0) {
        log("Fatal error CODE " + exitCode, reason);
    }
    var callee = userRegistry.getByExt(ext);
    if (callee) {
        //Hangup
        log(callee.ext, 'Ending calls...');
        callee.ua.terminateSessions();
        //Unregister
        log(callee.ext, 'Unregistering SIP UA...');
        callee.ua.unregister();
        //Close pipeline if existent
        if (callee.pipeline) {
            var pipeline = callee.pipeline;
            log(callee.ext, 'Releasing pipeline...');
            pipeline.release();
        }
    }
    log('stopAndExit()', 'Exiting...');
    process.exit();
}


/*
 * Terminate the one call, but don't end the program. 
 *
 * If exitCode < 0, this was an erroneous exit.
 */
function stopCall(exitCode, ext, reason) {
    if (exitCode < 0) {
        log("Call terminating!  Fatal error CODE " + exitCode, reason);
    }
    var callee = userRegistry.getByExt(ext);
    if (callee) {
        //Hangup
        log(callee.ext, 'Ending calls...');
        callee.ua.terminateSessions();

        //Close pipeline if existent
        if (callee.pipeline) {
            log(callee.ext, 'Releasing pipeline...');
            callee.pipeline.release();
        }

        // Release User so it can be put back into the pool
        log(ext, "Releasing User.");
        sipUserPool.releaseSipUser({ sipId: callee.ext, sipPass: callee.pass })
    }
    log(ext, "Terminated.");
}


// *************************** HELPER METHODS LIVE HERE *********************************

/*
 * Generate a key to use for SRTP
 */
function generateKey(size = 30) {
    const key = [];
    const buffer = crypto.randomBytes(size);
    buffer.forEach(b => {
        key.push(String.fromCharCode(b % 96 + 32));
    });
    return key.join('');
}

/*
 * Connect to the kurentoClient, which is essentially an interpreter that
 * allows us to talk to the Kurento Media Server (KMS).  As such, it can
 * really just be thought of as getting the KMS.
 *
 * IMPORTANT: If this hangs forever, it's a KMS connection issue.  Is KMS offline?
 */
function getKurentoClient(callback) {
    if (kurentoClient !== null) {
        return callback(null, kurentoClient);
    }

    debuglog("Going to Kurento....");
    Kurento(config.kurentoServer, function (error, _kurentoClient) {
        if (error) {
            var message = 'Could not find media server at address ' + config.kurentoServer;
            return callback(message + ". Exiting with error " + error);
        }
        debuglog("Established connection to KMS.");
        kurentoClient = _kurentoClient;
        callback(null, kurentoClient);
    });
}

/*
 * Create the Endpoints that form the ends of our simple pipeline.
 * Pipeline:
 *      playerEndpointIntro -> rtpEndpoint -> recorderEndpoint
 *      playerEndpointRec (not connected, used later)
 */
function createMediaElements(ext, pipeline, callback) {
    var callee = userRegistry.getByExt(ext);

    //First, create the RtpEndpoint.
    rtpParams = {
        mediaPipeline: pipeline,
        crypto: new SDES({
            crypto: "AES_128_CM_HMAC_SHA1_80",
            key: generateKey()
        })
    }
    pipeline.create('RtpEndpoint', rtpParams, function (error, rtpEndpoint) {
        if (error) {
            debuglog('createMediaElements 1');
            return callback(error);
        }

        //Parameters for the RecorderEndpoint
        var date = getTimestampString();
        recordParams = {
            mediaPipeline: pipeline,
            mediaProfile: callee.incomingMediaProfile,
            stopOnEndOfStream: true,
            uri: "file:/" + config.path + 'recordings/videomail_' + date + '.webm'
        };
        callee.recordingFile = 'videomail_' + date + '.webm';

        //RecorderEndpoint creation
        pipeline.create('RecorderEndpoint', recordParams, function (error, recorderEndpoint) {
            if (error) {
                debuglog('createMediaElements 2');
                return callback(error);
            }

            log(callee.ext, 'Recording to: ' + recordParams.uri);

            playerParams = {
                mediaPipeline: pipeline,
                uri: 'file:/' + config.path + 'media/' + config.playFileIntro,
                useEncodedMedia: true
            }

            //PlayerEndpoint creation
            pipeline.create('PlayerEndpoint', playerParams, function (error, playerEndpointIntro) {
                if (error) {
                    debuglog('createMediaElements 3');
                    return callback(error);
                }
                log(callee.ext, "Playing from: " + playerParams.uri);


                playerParamsRec = {
                    mediaPipeline: pipeline,
                    uri: 'file:/' + config.path + 'media/' + config.playFileRec,
                    useEncodedMedia: true
                }
                pipeline.create('PlayerEndpoint', playerParamsRec, function (error, playerEndpointRec) {
                    if (error) {
                        debuglog('createMediaElements 4');
                        return callback(error);
                    }
                    log(callee.ext, "Playing from: " + playerParamsRec.uri);

                    return callback(null, rtpEndpoint, recorderEndpoint, playerEndpointIntro, playerEndpointRec);
                });

            });
        });
    });
}

function onError(error) {
    if (error) {
        console.error(error);
        //stop();
    }
}

/*
 * Connect the three endpoints!
 * Pipeline Structure:
 *      PlayerEndpoint -> RtpEndpoint -> RecorderEndpoint
 */
function connectMediaElements(rtpEndpoint, recorderEndpoint, playerEndpoint, callback) {
    rtpEndpoint.connect(recorderEndpoint, 'AUDIO');
    rtpEndpoint.connect(recorderEndpoint, 'VIDEO');
    playerEndpoint.connect(rtpEndpoint, 'AUDIO');
    playerEndpoint.connect(rtpEndpoint, 'VIDEO');
    return callback(null);
}

/*
 * Start playback for a given playerEndpoint.
 * Prints out any erors that occur, and debugging info.
 */
function startPlayerEndpoint(playerEndpoint) {
    playerEndpoint.play(function (error) {
        if (error) {
            debuglog("PlayerEndpoint play() Error: " + error);
        }
        else {
            playerEndpoint.getVideoInfo(function (error, result) {
                if (error) {
                    debuglog("PlayerEndpoint getVideoInfo() Error: " + error);
                }
                else {
                    debuglog("PlayerEndpoint getVideoInfo():")
                    debuglog("*****@@####" + JSON.stringify(result));
                }
            });
        }
    });
}

/*
 *  * Switch from one playerEndpoint to another, changing the RtpEndpoint's source media.
 *   */
function switchPlayers(rtpEndpoint, oldPlayerEndpoint, newPlayerEndpoint, callback) {
    oldPlayerEndpoint.disconnect(rtpEndpoint, 'AUDIO');
    oldPlayerEndpoint.disconnect(rtpEndpoint, 'VIDEO');
    newPlayerEndpoint.connect(rtpEndpoint, 'AUDIO');
    newPlayerEndpoint.connect(rtpEndpoint, 'VIDEO');
    return callback(null);
}



/*
 * Determine the correct Media Profile based on the SDP.
 * Behavior:
 * | Inbound Video Codec | Inbound Audio Codec |             RESULT             |
 * |---------------------|---------------------|--------------------------------|
 * | H264                | ANY                 | MP4                            |
 * | H264                | NONE                | MP4_VIDEO_ONLY                 |
 * | VP8                 | ANY                 | WEBM                           |
 * | VP8                 | NONE                | WEBM_AUDIO_ONLY                |
 * | NONE                | ANY                 | ERROR: NO VIDEO CODEC          |
 * | OTHER               | ANY                 | ERROR: UNSUPPORTED VIDEO CODEC |
 */
function getMediaProfile(sdpOffer, ext) {
    var sdp = SDP.parse(sdpOffer);
    var videoCodec = undefined;
    var audioCodec = undefined;

    //There should only be one of each 'audio' and 'video',
    //but this loop allows us to be agnostic about the ordering of the sections.
    for (var media of sdp.media) {
        if (media.type == 'audio') {
            audioCodec = chooseCodec(media.rtp, ['PCMU', 'PCMA']);
        }
        if (media.type == 'video') {
            videoCodec = chooseCodec(media.rtp, ['VP8', 'H264']);
        }
    }

    //Did we find an acceptable video codec? If not, we have to exit.
    if (!videoCodec) {
        stopCall(-4, ext, "No acceptable video Codec found in offer:\n" + sdpOffer);
    }

    //Did we find an acceptable audio codec?
    if (audioCodec || !audioCodec) { //Only video
        debuglog("WARNING: No acceptable Audio Codec found. (configuration.js:allowableAudioCodecs)");
        debuglog("Detected Video Codec: " + videoCodec);
        if (videoCodec == "VP8") {
            return 'WEBM_VIDEO_ONLY';
        }
        else if (videoCodec == "H264") {
            return 'MP4_VIDEO_ONLY';
        }
    }
    else { //Both audio and video
        debuglog("Detected Incoming Codecs: " + audioCodec + " and " + videoCodec);
        if (videoCodec == "VP8") {
            return 'WEBM';
        }
        else if (videoCodec == "H264") {
            return 'MP4';
        }
    }
    //No acceptable video codec :(
    stopCall(-5, ext, "No acceptable Video Codec found. (configuration.js:allowableVideoCodecs) Offer:\n" + sdpOffer);
}

/*
 * Picks the first allowable codec found in the offers.
 * If none found, returns undefined.
 */
function chooseCodec(codecOffers, acceptableCodecs) {
    //If no codecs were offered, there's nothing to match :)
    if (!codecOffers || !acceptableCodecs) {
        return undefined;
    }

    //Check each codec in offer and return first match
    for (var offer of codecOffers) {
        var codec = offer.codec;
        var result = acceptableCodecs.find(value => value == codec);
        if (result) { //Alowable codec!
            return result;
        }
    }

    //No allowable codecs were found!
    return undefined;
}


//Timestamp based on system clock.  Returns a string in the format "YYYYMMDD_HHMMSS"
function getTimestampString() {
    var time = new Date();
    var year = time.getFullYear();
    var month = time.getMonth() + 1; //Incremented because of indexing at 0
    var day = time.getDate();
    var hours = time.getHours() + 1; //Incremented because of indexing at 0
    var minutes = time.getMinutes();
    var seconds = time.getSeconds();
    return `${year}${month < 10 ? '0' : ''}${month}${day < 10 ? '0' : ''}${day}_${hours < 10 ? '0' : ''}${hours}${minutes < 10 ? '0' : ''}${minutes}${seconds < 10 ? '0' : ''}${seconds}`;
}


//Timestamp based on system clock.  Returns a string in the format "[YYYY-MM-DD HH:MM:SS]"
function getTimeForLog() {
    var time = new Date();
    var year = time.getFullYear();
    var month = time.getMonth() + 1; //Incremented because of indexing at 0
    var day = time.getDate();
    var hours = time.getHours() + 1; //Incremented because of indexing at 0
    var minutes = time.getMinutes();
    var seconds = time.getSeconds();
    return `[${year}-${month < 10 ? '0' : ''}${month}-${day < 10 ? '0' : ''}${day} ${hours < 10 ? '0' : ''}${hours}:${minutes < 10 ? '0' : ''}${minutes}:${seconds < 10 ? '0' : ''}${seconds}]`;
}

//Only log message if debug variable is set
function debuglog(message) {
    if (config.debug > 0) {
        log(null, message);
    }
}

//Log a message, with timestamp
function log(ext, message) {
    if (ext) {
        console.log(getTimeForLog(), '|', ext, '|', message);
    }
    else {
        console.log(">>>>>", message);
    }
}
