Kurento-Asterisk Videomail Client
===================================

This is a Node.js servlet that connects the Kurento Media Server with an Asterisk PBX.  Currently, it is configured to receive calls from Asterisk, record them to a file, then upload the files using an API in the aserver.

### How can I use it?

Clone from master!  Any other branch is *under development*, so YMMV.

### What is it based on?

The core servlet is based mainly off the Kurento One2One call [tutorial](https://github.com/Kurento/kurento-tutorial-node/tree/master/kurento-one2one-call), but takes loose inspiration (and a few lines of code) from another kurento-asterisk [demo](https://github.com/agilityfeat/kurento-asterisk) by agilityfeat.

Installation Guide
==========================

Step 1: Install Kurento Media Server
------------------------------------

The installation procedure for the Kurento Media Server varies based on the operating system.  Ubuntu is preferred by the Kurento developers, but it is also possible to run on other linux distributions such as CentOS.  

Currently, only Ubuntu and Centos installations have been tested/verified.


_Installation Guides_

**Ubuntu**

To install on Ubuntu, you can follow the[ installation guide from the Kurento Wiki][2].

(Note: To check your Ubuntu version, you can type "`lsb_release -d`" into the terminal.)  

**Centos**

[Kurento RPMs (with installation instructions)][3].    (Last updated October 2017)

While not officially supported for Centos, Github user pkgs\-cloud has uploaded RPMs for Kurento Media server, allowing installation on Red Hat derivative OS's (such as Centos). 

#### __Verify your Installation __

Follow these "[Check your installation][4]" instructions from the Kurento developers.

Step 2: Install Node.js
-----------------------

__Checking Installation Status__

To run the demo, you must have both node.js and npm (node package manager) working on your linux system.  You can check your versions with node \-v and npm \-v.

Example output:

> $ node \-v
> 
> v10.3.0
> 
> $ npm \-v
> 
> 6.1.0

   
If both are installed and your versions match the versions in the above output (or are newer!), you can go on to Step 3.

If they aren’t installed, you’ll need to install them.  The best way I’ve found to do that is with Node Version Manager, or NVM.

#### __Installing Node with NVM__

#### To install NVM, follow these instructions: [https://github.com/creationix/nvm#installation][5]

Next run:

> nvm install stable 

To install the latest stable version of Node. 

Now try "node \-v" and "npm \-v" again.  If you see versions like the example output, you did it!

Step 3: Install the Videomail Servlet
-------------------------------------

#### __Getting the Source Code__

First, clone the source code from this git repository to your local computer.

Now move into the folder you cloned to, and check the contents as so:

> $ ls  
> configuration.js custom\-jssip package.json package\-lock.json [README.md][7] server.js

If you are missing any files, try cloning again and checking your proxy settings.

(If git commands are not working, try "`git config --global url."https://".insteadOf git:``//`")

#### __Installing the Servlet__

To install the Node.js application, in the folder you cloned to, run the following command:

> npm install

This should automatically install all required dependencies.  It may take a little while.

If this process hangs or gives error messages, try the command "`git config --global url."https://".insteadOf git:``//`" before running "`npm install`" again.)

Once NPM has finished, the servlet is installed and can be run.  (However, it will not connect to anything yet because it has not been configured.)

Step 4: Configure Kurento Media Server
--------------------------------------

The Kurento configuration files are located in /etc/kurento/ in the following structure:

    /etc/kurento
    	├── kurento.conf.json
    	└── modules
    	    └── kurento
    	        ├── BaseRtpEndpoint.conf.ini
    	        ├── HttpEndpoint.conf.ini
    	        ├── MediaElement.conf.ini
    	        ├── SdpEndpoint.conf.json
    	        ├── UriEndpoint.conf.ini
    	        └── WebRtcEndpoint.conf.ini

#### Main Configuration File (kurento.conf.json)

This file is where you define where the Kurento Media Server will register itself and be contacted!  

**Values to set:**

1.  "port" to the port your servlet will open a WS connection to Kurento on, \[KurentoPort\].
2.  "address" to the full WebSocket address for the Kurento Media Server ("ws://" + \[KurentoIP\] + ":" + \[KurentoPort\]+ "/kurento")
3.  "localAddress" to \[KurentoIP\] (same one you used in the full address above)
4.  "path" should be "kurento"   
      
    

**Example**
```javascript
//(/etc/kurento/kurento.conf.json)

{
    "mediaServer" : {
        "resources": {
            // //Resources usage limit for raising an exception when an object creation is attempted
            // "exceptionLimit": "0.8",
            // // Resources usage limit for restarting the server when no objects are alive
            // "killLimit": "0.7",
            // Garbage collector period in seconds
            "garbageCollectorPeriod": 240
        },
        "net" : {
            "websocket": {
                "port": 8111,
                //"secure": {  // Not currently being used!
                    // "port": 8433,
                    // "certificate": "defaultCertificate.pem",
                    // "password": ""
                //},
                "registrar": {
                    "address": "ws://kurento.localhost.com:8111/kurento",
                    "localAddress": "kurento.localhost.com"
                },
                "path": "kurento",
                "threads": 10
            }
        }
    }
}
```
#### Module Configuration Files

**With Required Changes**

HttpEndpoint.conf.ini  
   Purpose: Direct the HTTP module to the right registrar.
   Add:     serverAddress=\[KurentoIP\]  
          port=\[KurentoPort\]

**No Changes Needed**

BaseRTPEndpoint.conf.ini  
   Purpose: Limit RTP port range.
  
MediaElement.conf.ini  
   Purpose: Set output bitrate.
  
SdpEndpoint.conf.json  
   Purpose: New codecs are configured here. Comes with OPUS, PCMU, AMR, H264, and VP8.
  
UriEndpoint.conf.ini  
   Purpose: Set default path for media.
  
WebRtcEndpoint.conf.ini  
   Purpose: Set up a STUN server for WebRTC connections  
to Kurento. Not applicable to us because we  
connect to Asterisk using SIP.

Step 5: Configure Asterisk
--------------------------

For this section, I'm going to assume you already know how to set up a basic user profile and dialplan in Asterisk.  (If you don't, I highly recommend [this video tutorial series][8] by "The VoIP Guys".)   

#### pjsip.conf 

To set up a profile for Kurento to use, you can copy and paste the following into your pjsip.conf:  

User Profile Example

`[7777]`  
`type = endpoint`  
`context = internal`  
`disallow = all`  
__`allow = ulaw, vp8 //Allowable Codecs Go Here`__  
`aors = 7777`  
`auth = auth7777`  
`media_use_received_transport = yes`  
`trust_id_inbound=yes`  
`direct_media=no // Important! The servlet cannot handle the reinvites associated with direct media!`  
`direct_media_method=invite`  
`connected_line_method=invite`  
`ice_support=no`  
`use_avpf=no`  
`force_avp=no`  
  
`[7777]`  
`type = aor`  
`max_contacts = 1`  
  
`[auth7777]`  
`type=auth`  
`auth_type=userpass`  
`password=7777`  
`username=7777`

For Kurento to support multiple callers, it needs a different registration to Asterisk for each caller.  So making multiple of the above profile (with different numbers) is important.  By default, the demo will use 7777, 7778, and 7779.

#### extensions.conf

In your extensions.conf, in the same context you used for the users, add the following line (with your own numbers):

> `// User 7777, 7778, and 7779 will all be tried  
> // when the caller dials 7770  
> exten => 7770,1,Dial(PJSIP/7777&PJSIP/7778&PJSIP/7779)`

And that's it!  Remember to either completely restart Asterisk, or run both "`pjsip reload"` and "`dialpan reload"` from the Asterisk CLI.

Step 6: Configure the Videomail Servlet
---------------------------------------

All configuration for the videomail servlet occurs in the file __configuration.js.  __This file can be edited with any basic text editor.

### Configuration parameters:

Category| Parameter Name | Type |	Example Value	| Description
--- | --- | --- | --- | --- 
Debugging	| debug	| integer	| 0	| If 0 then no debug output is printed.  If 1 then extensive debug output is printed
SIP Server	| sipServer	| string	| '192.168.1.1'	| The IP address of the SIP (Asterisk) server the servlet should register to.
^ | sipWsPort	| string	| '8088'	| The port that the servlet will use to open Websocket connections to the Asterisk server.
^ | credArray	| array of string pairs | [{ sipId: '7778', sipPass: '7778'}, { sipId: '7777', sipPass: '7777'}]	| Each { sipID, sipPass } pair is an extension and password the servlet can use to register to Asterisk. There must be at least one element in the array.
Kurento	| kurentoServer	| string	| 'ws://192.168.87.7:8111/kurento'	| The websocket address of the Kurento Media Server, as defined in /etc/kurento/kurento.conf.json
Media |	path	| string	| 'file://' + \_\_dirname + '/'	| Default URI path to "recordings" and "media" folders, where the servlet will store and find playable media (respectively).
^ | playFile	| string	| 'videomail.webm'	| The name of the file to play. Will be looked for at (path)/media/(playFile)
^ | playEncodedMedia	| boolean	| true	| Whether or not the Media Player should use encoded instead of raw media.
^ | incomingMediaProfile	| string	| 'WEBM'| IMPORTANT: The type of media the Recorder will receive from the external caller. MUST match or else the servlet will not record.  Possible values: 'WEBM', 'MP4', 'WEBM_VIDEO_ONLY', 'WEBM_AUDIO_ONLY', 'MP4_VIDEO_ONLY', 'MP4_AUDIO_ONLY', 'JPEG_VIDEO_ONLY', 'KURENTO_SPLIT_RECORDER'
SDP Modification	| modifySdpIncoming	| function(string) : string	| See "sdpOffer Example" below. | Given the incoming sdpOffer from Asterisk as a string, this function returns the SDP that will be passed to Kurento Media Server for processing.  More information on SDP Modification can be found here: TODO
^ | modifySdpOutgoing	| function(string, string) : string	| See "sdpAnswer Example" below. | Given both the incoming sdpOffer and the generated sdpAnswer, this function creates the desired response SDP to be sent back to Asterisk. More information on SDP Modification can be found here: TODO  
  
**SdpOffer Example**
```javascript function(sdpOffer) {

var sdp = SDP.parse(sdpOffer);

//Change contact IP in connection field.
sdp.connection.ip = '192.168.87.3';

return SDP.write(sdp);
} 
```

**SdpAnswer Example**
```javascript
function(sdpOffer, sdpAnswer) {

var sdp = SDP.parse(sdpAnswer);

//Set to sendonly
sdp.direction = 'sendonly';

return SDP.write(sdp);
} 
```

[2]: https://doc-kurento.readthedocs.io/en/stable/user/installation.html
[3]: https://github.com/pkgs-cloud/kurento
[4]: https://doc-kurento.readthedocs.io/en/stable/user/installation.html#check-your-installation
[5]: https://github.com/creationix/nvm#installation
[7]: http://README.md
[8]: https://www.youtube.com/watch?v=jMQfSsO1da4&list=PLnzEbgyK52Gu9fdVDHburrsG3KBIntXFK

