/**
 * Copyright (c) HashiCorp, Inc.
 * Copyright (c) OpenTofu
 * SPDX-License-Identifier: MPL-2.0
 */

// Node.js core
const os = require('os');
const path = require('path');

// External
const core = require('@actions/core');
const tc = require('@actions/tool-cache');
const io = require('@actions/io');
const releases = require('./releases');

// arch in [arm, x32, x64...] (https://nodejs.org/api/os.html#os_os_arch)
// return value in [amd64, 386, arm]
function mapArch (arch) {
  const mappings = {
    x32: '386',
    x64: 'amd64'
  };
  return mappings[arch] || arch;
}

// os in [darwin, linux, win32...] (https://nodejs.org/api/os.html#os_os_platform)
// return value in [darwin, linux, windows]
function mapOS (os) {
  if (os === 'win32') {
    return 'Windows';
  }
  const platform = os.charAt(0).toUpperCase() + os.slice(1);
  return platform;
}

async function downloadAndExtractCLI (url) {
  core.debug(`Downloading tenv CLI from ${url}`);
  const pathToCLIZip = await tc.downloadTool(url);

  if (!pathToCLIZip) {
    throw new Error(`Unable to download tenv from ${url}`);
  }

  let pathToCLI;

  core.debug('Extracting tenv CLI zip file');
  if (os.platform().startsWith('win')) {
    core.debug(`tenv CLI Download Path is ${pathToCLIZip}`);
    const fixedPathToCLIZip = `${pathToCLIZip}.zip`;
    io.mv(pathToCLIZip, fixedPathToCLIZip);
    core.debug(`Moved download to ${fixedPathToCLIZip}`);
    pathToCLI = await tc.extractZip(fixedPathToCLIZip);
  } else {
    pathToCLI = await tc.extractZip(pathToCLIZip);
  }

  core.debug(`tenv CLI path is ${pathToCLI}.`);

  if (!pathToCLI) {
    throw new Error('Unable to unzip tenv');
  }

  return pathToCLI;
}

async function installWrapper (pathToCLI) {
  let source, target;

  // If we're on Windows, then the executable ends with .exe
  const exeSuffix = os.platform().startsWith('win') ? '.exe' : '';

  // Rename tenv(.exe) to tenv-bin(.exe)
  try {
    source = [pathToCLI, `tenv${exeSuffix}`].join(path.sep);
    target = [pathToCLI, `tenv-bin${exeSuffix}`].join(path.sep);
    core.debug(`Moving ${source} to ${target}.`);
    await io.mv(source, target);
  } catch (e) {
    core.error(`Unable to move ${source} to ${target}.`);
    throw e;
  }

  // Install our wrapper as tenv
  try {
    source = path.resolve([__dirname, '..', 'wrapper', 'dist', 'index.js'].join(path.sep));
    target = [pathToCLI, 'tenv'].join(path.sep);
    core.debug(`Copying ${source} to ${target}.`);
    await io.cp(source, target);
  } catch (e) {
    core.error(`Unable to copy ${source} to ${target}.`);
    throw e;
  }

  // Export a new environment variable, so our wrapper can locate the binary
  core.exportVariable('TENV_CLI_PATH', pathToCLI);
}

async function run () {
  try {
    // Gather GitHub Actions inputs
    const version = core.getInput('tenv_version');
    const wrapper = core.getInput('tenv_wrapper') === 'true';
    let githubToken = core.getInput('github_token');
    if (githubToken === '' && !(process.env.FORGEJO_ACTIONS || process.env.GITEA_ACTIONS)) {
      // Only default to the environment variable when running in GitHub Actions. Don't do this for other CI systems
      // that may set the GITHUB_TOKEN environment variable.
      githubToken = process.env.GITHUB_TOKEN;
    }

    // Gather OS details
    const osPlatform = os.platform();
    const osArch = os.arch();

    core.debug(`Finding releases for tenv version ${version}`);
    const release = await releases.getRelease(version, githubToken);
    const platform = mapOS(osPlatform);
    const arch = mapArch(osArch);
    const build = release.getBuild(platform, arch);
    if (!build) {
      throw new Error(`tenv version ${version} not available for ${platform} and ${arch}`);
    }

    // Download requested version
    const pathToCLI = await downloadAndExtractCLI(build.url);

    // Install our wrapper
    if (wrapper) {
      await installWrapper(pathToCLI);
    }

    // Add to path
    core.addPath(pathToCLI);

    return release;
  } catch (error) {
    core.error(error);
    throw error;
  }
}

module.exports = run;
