const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');


module.exports.getSourceSavePath = () => {
    let fullPath;

    do {
        fullPath = path.join(process.env.SOURCES_SAVE_PATH, uuidv4());
    } while(fs.existsSync(fullPath));

    fs.mkdirSync(fullPath);

    return path.join(fullPath, 'source.zip');
}

module.exports.cleanup = (projectPath) => {
    try {
        fs.rmSync(projectPath, { recursive: true, force: true });
    } catch (e) {
        console.error(`cleanup failed ${e}`);
    }
}