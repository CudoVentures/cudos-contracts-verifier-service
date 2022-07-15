const fs = require('fs');
const path = require('path');
const util = require('util');
const childProc = require('child_process');

const { v4: uuidv4 } = require('uuid');
const toml = require('toml');


const compileCmdFormat = `docker run --rm -v %s:/code \
    --mount type=bind,source="%s",target=/code/target \
    --mount type=bind,source="%s",target=/usr/local/cargo/registry \
    %s`;


module.exports = (projectPath, optimizer, crateName) => {
    const uid = uuidv4();
    const buildCachePath = path.join(process.env.BUILD_CACHE_PATH, `proc-${uid}-build-cache`);
    
    fs.mkdirSync(buildCachePath);

    const compileCmd = util.format(compileCmdFormat, projectPath, buildCachePath, 
        process.env.REGISTRY_CACHE_PATH, optimizer);

    try {
        childProc.execSync(compileCmd, {
            cwd: projectPath,
            timeout: Number(process.env.COMPILE_TIMEOUT),
        });
    } catch (e) {
        console.error(e);
        throw e.stderr.toString();
    }

    try {
        fs.rmSync(buildCachePath, { recursive: true, force: true });
    } catch (e) {
        console.error(`build cache "${buildCachePath}" cleanup failed ${e}`);
    }

    if (!crateName) {
        const parsedCargo = parseCargo(projectPath);
        crateName = getCrateName(parsedCargo);
    }

    const binaryName = crateName.replaceAll('-', '_') + '.wasm';
    const binaryPath = path.join(projectPath, 'artifacts', binaryName);

    if (!fs.existsSync(binaryPath)) {
        throw `failed to compile, binary not found "${binaryPath}"`;
    }

    return binaryPath;
}

const parseCargo = (projectPath) => {
    const cargoData = fs.readFileSync(path.join(projectPath, 'Cargo.toml'));
    return toml.parse(cargoData.toString());
}

const getCrateName = (parsedCargo) => {
    return parsedCargo['package']['name'].replaceAll('-', '_');
}
