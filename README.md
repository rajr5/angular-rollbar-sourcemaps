# Angular Rollbar Sourcemaps

## Description
This library shows a blue print of uploading sourcemaps from Angular to Rollbar and removing them from the production build after being uploaded.

## Considerations
At the time of writing, Angular builds for large projects have a tendency to run out of memory on production builds when build optimizations and sourcemaps are enabled.

This example is using Heroku, so you will need to figure how and when to call the package.json scripts if you are using an alternate platform based on your build process.

## Dependencies
**In addition to Angular:**
* form-data
* dotenv
* read-last-lines

# Overview
1. Generate a `versions.prod.ts` file prior to the angular build, which is used for rollbar
2. Run angular build with sourcemaps turned on (may require node GC adjustment)
3. upload all files to Rollbar
4. Delete sourcemaps
5. remove sourcemap reference from JS files to avoid browser errors

# Example
I am using Heroku, so you will need to adjust if using other platforms.
NPM SCRIPTS: (view `package.json` for examples)
1. `postinstall` runs after `npm install` - invoked from heroku automatically
  1. `"postinstall": "cross-env NODE_OPTIONS=--max-old-space-size=8192 npm run build",`
2. `build` runs, first generating `version.prod.ts` by calling `npm run update-version-revision` file is generated (add this file to `.gitignore`)
3. `update-version-revision` generates versions file that is used to send to rollbar about current code version
4. `heroku-postbuild` is invoked by Heroku - which in turn calls `upload-maps-to-rollbar`
5. `upload-maps-to-rollbar`
  1. uploads all sourcemaps to rollbar
  2. deletes source maps
  3. updates source code to remove sourcemap reference

# Things you need to update
`upload-sourcemaps.ts`
* ensure `BASE_PATH` is set correctly based on the build
* Ensure sourcemaps are enabled in `angular.json` or in the npm script that calls `ng build`

`.gitignore`
* update to include `version.prod.ts` so you are not annoyed.

`set-versions.ts`
* ensure `BASE_PATH` is set correctly based on the build

`git-helper`
* Heroku does not operate in a git directory during build, but the env var `SOURCE_VERSION` is provided instead. If your build platform has similar such patterns, you may need to adjust here. This file will work as long as the build happens in a git project OR an env var is set for `SOURCE_VERSION`

`rollbar.service.ts`
* This is an example of a Rollbar service for reference, but you will need to implement your own based on your project needs.
  * Note: Sourcemaps did not work until I implemented the dynamic domain (which is great on heroku where we promote environments without new builds)
  * I am fairly sure that the server setting must also be configured accurately - `server: { host: this.serverUrl, root: 'webpack:///./' },`
