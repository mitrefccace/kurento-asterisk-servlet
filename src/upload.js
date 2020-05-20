module.exports = {
  UploadVideomail: UploadVideomail
}

const config = require('./configuration.js');
const fs = require('fs');
const request = require('request');
const path = require('path');
const uploadAPI = config.uploadServer + '/uploadVideomail';
const recordingFilepath = config.path + 'recordings/';
const FormData = require('form-data');

function UploadVideomail() {
  this.post = post;
}


function post(callinfo) {
  let filepath = recordingFilepath + callinfo.recordingFile
  fs.stat(filepath, function (err, stat) {
    if (!err) {
      let videomailFile = fs.createReadStream(filepath);
      videomailFile.on('finish', function () {
        let formData = new FormData();
        formData.append('videomail', videomailFile, callinfo.recordingFile);
        formData.append('duration', callinfo.callDuration);
        formData.append('ext', callinfo.ext);
        formData.append('phoneNumber', callinfo.incomingCaller);

        request({
          method: 'POST',
          url: uploadAPI,
          rejectUnauthorized: false,
          body: formData,
          headers: formData.getHeaders(),
        }, function (error, response, data) {
          if (error) {
            console.log("Error", error);
            console.log("Could not upload:", new Date(), callinfo.incomingCaller, callinfo.recordingFile);
          } else {
            console.log("Successful video upload:", new Date(), callinfo.incomingCaller, callinfo.recordingFile);
          }
        });
      });
    } else if (err.code === 'ENOENT') {
      console.log("No Videomail File for call:", new Date(), callinfo.incomingCaller, callinfo.recordingFile);
    } else {
      console.log('Error when trying to upload file: ', err.code);
    }
  });
}
