Kurento-Asterisk Videomail Client
===================================

This is a Node.js servlet that connects the Kurento Media Server with an Asterisk PBX.  Currently, it is configured to receive calls from Asterisk, record them to a file, then upload the files using an API in the aserver.

### Getting Started
To install kurento asterisk servlet:
1. Clone this repository onto the kurento media server
1. Download and install [Node.js](https://nodejs.org/en/)
1. Configure kurento-asterisk-servlet (see configuration)
1. Install the required Node.js modules: cd into the kurento-asterisk-servlet directory, run `npm install`
1. To start the Kurento Asterisk Servlet manually, run `npm start` or if using pm2 `pm2 start process.json`

### Configuration

The Kurento Asterisk Servlet has a configuration file located at src/configuration.js_TEMPLATE. Create a copy of the template file in the same directory, rename it to `configuration.js`. The configuration file has fields that are unique for your environment, these fields are identified by `<description of value>`. Replace template values with actual values related to your environment. 


