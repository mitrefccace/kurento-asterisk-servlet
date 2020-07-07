// Export the RedisStore object so the servlet can use it.
module.exports = {
    RedisManager: RedisManager
}

const redis = require("redis");
const config = require('./configuration.js');
const { promisify } = require("util");


var redisClient, hGetAsync;
var rExtensionToVrs = config.redisExt2VRS;

// Definition of helper class to represent registrar of users
function RedisManager() {
    this.vrsLookup = vrsLookup;
    this.init = init;
}

function init() {
    // Create a connection to Redis
    redisClient = redis.createClient(config.redisPort, config.redisHost);
    hGetAsync = promisify(redisClient.hget).bind(redisClient);
    redisClient.auth(config.redisAuth);
    redisClient.on("error", function (err) {
        console.error("");
        console.error("**********************************************************");
        console.error("REDIS CONNECTION ERROR: Please make sure Redis is running.");
        console.error("**********************************************************");
        console.error("");
        console.error(err);
        process.exit(-99);
    });

    //catch Redis warnings
    redisClient.on("warning", function (warning) {
        console.warn('REDIS warning: ' + warning);
    });

    redisClient.on('connect', function () {
        console.info("Connected to Redis");
    });



}

// Look up the extension to VRS Mapping.
async function vrsLookup(webrtcExtension) {
    let value = await hGetAsync(rExtensionToVrs, webrtcExtension);
    if (value != null){
        return value;
    }else {
        return webrtcExtension;
    }
}

