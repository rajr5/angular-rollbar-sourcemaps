import { ErrorHandler, Inject, Injectable, InjectionToken } from '@angular/core';
import * as Rollbar from 'rollbar';
import { ROLLBAR_ACCESS_TOKEN, versions } from './environments/versions';

const locRegex = /^(https?):\/\/[a-zA-Z0-9._-]+\.somdomain\.io(.*)/;

const rollbarConfig: Rollbar.Configuration = {
  accessToken: ROLLBAR_ACCESS_TOKEN,
  logLevel: 'error',
  captureUncaught: true,
  captureUnhandledRejections: true,
  filterTelemetry: (ev: Rollbar.TelemetryEvent) => {
    try {
      return (
        ev.type === 'network' &&
        (ev.body['subtype'] === 'xhr' || ev.body['subtype'] === 'fetch') &&
        ev.body['url'].startsWith('https://api.mixpanel.com')
      );
    } catch (ex) {
      return false;
    }
  },
  transform: (payload: any) => {
    // https://docs.rollbar.com/docs/source-maps/#section-using-source-maps-on-many-domains
    try {
      // transform frame to change domain to dynamichost to allow sourcemaps to work in any environment
      const trace = payload.body.trace;
      if (trace && trace.frames) {
        trace.frames.forEach((frame) => {
          if (frame.filename) {
            const m = frame.filename.match(locRegex);
            frame.filename = m[1] + '://dynamichost' + m[2];
          }
        });
      }
    } catch (ex) {}
  },
  scrubFields: ['accessToken', 'refreshToken', 'altAccessToken', 'altRefreshToken', 'salesforceOrgs'],
};

export const RollbarService = new InjectionToken<Rollbar>('rollbar');

@Injectable()
export class RollbarErrorHandler implements ErrorHandler {
  serverUrl: string;
  environment: 'development' | 'staging' | 'production';

  person: {
    id: string;
    email: string;
    username: string;
  };

  constructor(@Inject(RollbarService) private rollbar: Rollbar, private log: LogService) {}

  handleError(err: any): void {
    this.rollbar.error(err.originalError || err);
    this.log.error(err);
  }

  private configurePayload() {
    this.rollbar.configure({
      ...rollbarConfig,
      environment: this.environment,
      payload: {
        environment: this.environment,
        person: this.person,
        server: { host: this.serverUrl, root: 'webpack:///./' },
        client: {
          javascript: {
            source_map_enabled: true,
            code_version: versions.revision,
            guess_uncaught_frames: true,
          },
        },
      },
    });
  }

  configureFromParams(options: { rollbar?: 'on' | 'off'; rollbarLog?: 'on' | 'off' }) {
    if (options.rollbar === 'on') {
      rollbarConfig.enabled = true;
    } else if (options.rollbar === 'off') {
      rollbarConfig.enabled = false;
    }

    if (options.rollbarLog === 'on') {
      rollbarConfig.autoInstrument = { log: true };
    } else if (options.rollbarLog === 'off') {
      rollbarConfig.autoInstrument = { log: false };
    }
    this.configurePayload();
    this.log.info('Configuring rollbar settings', options);
  }

  isLogTrackingOn(): boolean {
    return _.get(rollbarConfig, 'autoInstrument.log', true) ? true : false;
  }

  setUser(user: UserInfo) {
    try {
      this.person = {
        id: user.id,
        email: user.email,
        username: user.email,
      };
      this.configurePayload();
    } catch (ex) {
      // user likely not authenticated
      this.log.debug('Could not set user info on rollbar for error tracking - user likely not logged in');
    }
  }

  setEnvironment(serverUrl: string, env: 'development' | 'staging' | 'production') {
    this.serverUrl = serverUrl;
    this.environment = env;
    this.configurePayload();
  }

  toggleEnabled(enabled: boolean) {
    rollbarConfig.enabled = enabled;
    this.configurePayload();
  }

  logEvent(...data: any[]) {
    this.rollbar.error(...data);
  }
}

export function rollbarFactory() {
  if (location.host.includes('localhost')) {
    rollbarConfig.autoInstrument = {
      log: false,
    };
  }
  return new Rollbar(rollbarConfig);
}
