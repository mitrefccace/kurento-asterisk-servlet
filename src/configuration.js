var SDP = require('sdp-transform');

module.exports = {
	debug: 1, //0: no debug, 1: yes debug 

	// SIP server configurations
	sipServer: 'ace40asterisk.task3acrdemo.com',
	sipWsPort: '443',
	credArray: [
		{ sipId: '88001', sipPass: '1qaz1qaz' },
		{ sipId: '88002', sipPass: '1qaz1qaz' },
		{ sipId: '88003', sipPass: '1qaz1qaz' },
		{ sipId: '88004', sipPass: '1qaz1qaz' },
		{ sipId: '88005', sipPass: '1qaz1qaz' }],

	// Kurento server configurations
	kurentoServer: "wss://kms.task3acrdemo.com:8443/kurento", 
	uploadServer: "https://172.21.1.107:9406",
 	path: '/home/mwoodman/kurento-asterisk-servlet/',  //Default path to "recordings" and "media" folders
	playFileIntro: 'ready5.webm',
	playFileRec: 'recording2.webm',
	playEncodedMedia: true,
	incomingMediaProfile: 'WEBM',
	recordingFormat: 'webm',
	allowableVideoCodecs: ['VP8', 'H264'],
	allowableAudioCodecs: ['PCMU', 'PCMA'],

	// Modify the incoming SDP before it is passed on to Kurento.
	modifySdpIncoming: function (sdpOffer) {
		var sdp = SDP.parse(sdpOffer);
		//sdp.media[1].fmtp[0].config = "level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42001f"
		return SDP.write(sdp);
	},

	// Return a modified SDP, based on either the SDP offer or the generated answer provided 
	modifySdpOutgoing: function (sdpOffer, sdpAnswer) {
		var sdp = SDP.parse(sdpAnswer);
		return SDP.write(sdp);
	}
}
