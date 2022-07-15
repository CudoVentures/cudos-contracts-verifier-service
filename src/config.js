require('dotenv').config();

const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { EOL } = require('os');
const path = require('path');


const CONFIG_KEYS = ['SOURCES_SAVE_PATH', 'MONGO_URI', 'QUEUE_ITEM_VISIBILITY', 'QUEUE_CHECK_INTERVAL',
    'NODE_RPC_URL', 'BUILD_CACHE_PATH', 'REGISTRY_CACHE_PATH'];

const REGISTRY_CACHE_PATH = 'REGISTRY_CACHE_PATH';


module.exports.verifyConfig = () => {
    for (const configKey of CONFIG_KEYS) {
        if (!process.env[configKey]) {
            throw `config value '${configKey}' is not set`;
        }
    }

    try {
        if (!fs.existsSync(process.env['BUILD_CACHE_PATH'])) {
            fs.mkdirSync(process.env['BUILD_CACHE_PATH']);
        }

        if (process.env[REGISTRY_CACHE_PATH].indexOf('proc') == -1) {

            if (!fs.existsSync(process.env[REGISTRY_CACHE_PATH])) {
                fs.mkdirSync(process.env[REGISTRY_CACHE_PATH]);
            }

            const uid = uuidv4();

            process.env[REGISTRY_CACHE_PATH] = path.join(process.env[REGISTRY_CACHE_PATH], `proc-${uid}-registry-cache`);

            fs.mkdirSync(process.env[REGISTRY_CACHE_PATH]);

            setEnvValue(REGISTRY_CACHE_PATH, process.env[REGISTRY_CACHE_PATH]);
        }
    } catch (e) {
        throw `failed to configure build and registry cache paths: ${e}`;
    }
}

setEnvValue = (key, value) => {
    const envVars = fs.readFileSync("./.env", "utf8").split(EOL);

    const target = envVars.indexOf(envVars.find((line) => {
        return line.match(new RegExp(key));
    }));

    if (target == -1) {
        envVars.push(`${key}=${value}`);
    } else {
        envVars.splice(target, 1, `${key}=${value}`);
    }

    fs.writeFileSync("./.env", envVars.join(EOL));
}