module.exports = {
  UploadVideomail: UploadVideomail
}

const config = require('./configuration.js');
const fs = require('fs');
const request = require('request');
const path = require('path');
const uploadAPI = config.uploadServer + '/UploadVideomail';
const recordingFilepath = config.path + 'recordings/';
const FormData = require('form-data');
const { getVideoDurationInSeconds } = require('get-video-duration');

function UploadVideomail() {
  this.post = post;
}


function post(callinfo) {
  console.log("Attempting to Post Videomail recording", callinfo.recordingFile, callinfo.incomingCaller)
  let filepath = recordingFilepath + callinfo.recordingFile
  fs.stat(filepath, function (err, stat) {
    if (stat.size == 0) {
      console.log('Error Videomail file contains no data: ', new Date(), callinfo.incomingCaller, callinfo.recordingFile);
    } else if (!err) {
      let videomailFile = fs.createReadStream(filepath);
      videomailFile.on('data', (chunk) => {
        // just to be sure file has reached the end.
      });

      videomailFile.on('end', function () {
        console.log("file has ended, upload the file", callinfo.incomingCaller)
        getVideoDurationInSeconds(filepath).then((duration) => {
          let formData = new FormData();
          formData.append('videomail', fs.createReadStream(filepath), callinfo.recordingFile);
          formData.append('duration', Math.floor(duration));
          formData.append('ext', callinfo.ext);
          formData.append('phoneNumber', callinfo.incomingCaller);

          console.log(uploadAPI)

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
      });
    } else if (err.code === 'ENOENT') {
      console.log("No Videomail File for call:", new Date(), callinfo.incomingCaller, callinfo.recordingFile);
    } else {
      console.log('Error when trying to upload file: ', err.code);
    }
  });
}
