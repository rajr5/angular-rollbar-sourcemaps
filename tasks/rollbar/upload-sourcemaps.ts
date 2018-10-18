import * as dotenv from 'dotenv';
import * as FD from 'form-data';
import * as fs from 'fs';
import * as http from 'http';
import * as path from 'path';
import { getGitRevision } from './git-helper';
const FormData = require('form-data');
const readLastLines = require('read-last-lines');

dotenv.config({ path: path.join(__dirname, '../../.env') });

interface FileObj {
  jsFile: string;
  jsFileServerPath: string;
  mapFile: string;
  mapCleaned: boolean;
  sourceCleaned: boolean;
  error?: any;
}

if ((process.env.SERVER_URL || 'localhost').includes('localhost')) {
  console.log('User is on localhost, skipping uploading files to Rollbar');
  process.exit(0);
}

const BASE_PATH = path.join(__dirname, '../../dist/client');
const ROLLBAR_PATH = 'https://api.rollbar.com/api/1/sourcemap';

getSourceMapFileList().catch((err: any) => {
  process.exit(1);
});

async function getSourceMapFileList() {
  try {
    const revision = getGitRevision();
    console.log('Revision', revision);

    const files: FileObj[] = fs
      .readdirSync(BASE_PATH)
      .filter((item) => item.endsWith('.js') && fs.existsSync(path.join(BASE_PATH, `${item}.map`)))
      .map((file) => ({
        jsFile: path.join(BASE_PATH, file),
        jsFileServerPath: `https://dynamichost/${file}`,
        mapFile: path.join(BASE_PATH, `${file}.map`),
        mapCleaned: false,
        sourceCleaned: false,
      }));

    try {
      console.log('Uploading files to Rollbar');
      await Promise.all(files.map((file) => uploadFileToRollbar(file, revision)));
      console.log('Successfully finished uploading files to Rollbar');

      await Promise.all(files.map((file) => deleteMapFile(file)));

      await Promise.all(files.map((file) => removeMapReferenceFromJsFile(file)));
    } catch (ex) {
      console.log(ex);
      process.exit(1);
    }

    process.exit(0);
  } catch (ex) {
    process.exit(1);
  }
}

function uploadFileToRollbar(file: FileObj, revision: string): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('Uploading file:', file.mapFile);
    console.log('version', revision);
    console.log('minified_url', file.jsFileServerPath);

    const form: FD = new FormData();
    form.append('access_token', process.env.ROLLBAR_ACCESS_TOKEN);
    form.append('version', revision);
    form.append('minified_url', file.jsFileServerPath);
    form.append('source_map', fs.createReadStream(file.mapFile));

    form.submit(ROLLBAR_PATH, (error: Error | null, response: http.IncomingMessage) => {
      if (error) {
        console.log('Error uploading file', file.jsFile);
        console.log(error);
        file.error = error;
        resolve();
      } else if (response.statusCode !== 200) {
        console.log('Error uploading file', file.jsFile);
        console.log(response.statusMessage);
        file.error = response.statusMessage;
        resolve();
      } else {
        console.log('File uploaded successfully', file.mapFile);
        resolve();
      }
    });
  });
}

function deleteMapFile(file: FileObj) {
  return new Promise((resolve, reject) => {
    console.log('Deleting map file:', file.mapFile);
    fs.unlink(file.mapFile, (error: Error) => {
      if (error) {
        console.log('Error deleting map file:', file.mapFile);
        resolve();
      } else {
        console.log('Deleted map file successfully:', file.mapFile);
        file.mapCleaned = true;
        resolve();
      }
    });
  });
}

function removeMapReferenceFromJsFile(file: FileObj) {
  return new Promise((resolve, reject) => {
    console.log('Removing reference from JS file:', file.jsFile);
    readLastLines.read(file.jsFile, 1).then((lines: any) => {
      const numToRemove = lines.length;
      fs.stat(file.jsFile, (err, stats) => {
        if (err) {
          console.log('Error truncating file', file.jsFile);
          return reject(err);
        }
        fs.truncate(file.jsFile, stats.size - numToRemove, (truncateErr: any) => {
          if (truncateErr) {
            console.log('Error truncating file', file.jsFile);
            return reject(truncateErr);
          }
          console.log('File truncated successfully', file.jsFile);
          file.sourceCleaned = true;
          resolve();
        });
      });
    });
  });
}
