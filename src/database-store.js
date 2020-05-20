// Export the DatabaseStore object so the servlet can use it.
module.exports = {
    DatabaseStore: DatabaseStore
}

const mysql = require('mysql');
const nconf = require('nconf');
const fs = require('fs');

var connection;

// Definition of helper class to represent registrar of users
function DatabaseStore() {
    this.storeCall = store;
    this.init = init;
}

// Retrives configuration values from db_config.json
function getConfigVal(param) {
    var val = nconf.get(param);
    if (typeof val !== 'undefined' && val !== null) {
        return val;
    } else {
        console.log('*******************************************************');
        console.log('ERROR!!! Config parameter is missing: ' + param);
        console.log('*******************************************************');
        return null;
    }
}

function init() {
    var dbConfigFile = __dirname + '/db_config.json';
    try {
        let content = fs.readFileSync(dbConfigFile, 'utf8');
        let myjson = JSON.parse(content); // throws exception if parse fails
    } catch (ex) {
        console.log('Error occurred while validating dbConfigFile: ' + ex)
        return "Error occured while vlidating dbConfigFile";
    }
    nconf.file({
        file: dbConfigFile
    });

    // Get configuration values for connecting to MySQL
    const dbHost = getConfigVal('mysql:host');
    const dbUser = getConfigVal('mysql:user');
    const dbPassword = getConfigVal('mysql:password');
    const dbName = getConfigVal('mysql:acedirect_database_name');
    const dbPort = getConfigVal('mysql:port');

    // Create a connection to MySQL
    var mysqlConfig = {
        host: dbHost,
        user: dbUser,
        password: dbPassword,
        database: dbName,
        port: dbPort
    }

    connection = mysql.createConnection(mysqlConfig);

    // Connect to the MySQL database
    connection.connect(function (err) {
        if (err !== null) {
            return 'ERROR connecting to MySQL';
        }
        console.log('Successfully connected to MySQL')
    });
}

// Store the call to the Database.
function store(callinfo) {

    let query = `INSERT INTO ${getConfigVal('mysql:videomail_tablename')} (extension, received, 
        status, video_filename, video_filepath, deleted, callbacknumber, video_duration) 
        VALUES(?, now(), "UNREAD", ?, ?, 0, ?, ?)`;

    let params = [
        callinfo.incomingCaller,
        callinfo.recordingFile,
        getConfigVal('videomail:filepath'),
        callinfo.incomingCaller,
        callinfo.callDuration
    ];

    console.log("DB INSERT>>>>",params)
    return; //mw
    connection.query(query,params, function (err, result) {
        if (err) {
            console.log(err);
        }
        else {
            console.log('Record was successfully inserted into MySQL for call \"%s\"', callinfo.recordingFile);
        }
    });
}

