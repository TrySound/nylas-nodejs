import request, { UrlOptions, CoreOptions } from 'request';

import * as config from './config';
import RestfulModel from './models/restful-model';
import RestfulModelCollection from './models/restful-model-collection';
import CalendarRestfulModelCollection from './models/calendar-restful-model-collection';
import ContactRestfulModelCollection from './models/contact-restful-model-collection';
import RestfulModelInstance from './models/restful-model-instance';
import Account from './models/account';
import ManagementAccount from './models/management-account';
import ManagementModelCollection from './models/management-model-collection';
import Thread from './models/thread';
import { Contact } from './models/contact';
import Message from './models/message';
import Draft from './models/draft';
import File from './models/file';
import Calendar from './models/calendar';
import Event from './models/event';
import JobStatus from './models/job-status';
import Resource from './models/resource';
import Delta from './models/delta';
import { Label, Folder } from './models/folder';

const PACKAGE_JSON = require('../package.json');
const SDK_VERSION = PACKAGE_JSON.version;
const SUPPORTED_API_VERSION = '2.1';

export type RequestOptions = {
  path: string;
  method?: string;
  headers?: { [key: string]: string };
  qs?: { [key: string]: any };
  downloadRequest?: boolean;
  json?: boolean;
  formData?: any;
  body?: any;
};

export default class NylasConnection {
  accessToken: string | null | undefined;
  clientId: string | null | undefined;

  threads = new RestfulModelCollection(Thread, this);
  contacts = new ContactRestfulModelCollection(this);
  messages = new RestfulModelCollection(Message, this);
  drafts = new RestfulModelCollection(Draft, this);
  files = new RestfulModelCollection(File, this);
  calendars = new CalendarRestfulModelCollection(this);
  jobStatuses = new RestfulModelCollection(JobStatus, this);
  events = new RestfulModelCollection(Event, this);
  resources = new RestfulModelCollection(Resource, this);
  deltas = new Delta(this);
  labels = new RestfulModelCollection(Label, this);
  folders = new RestfulModelCollection(Folder, this);
  account = new RestfulModelInstance(Account, this);

  constructor(
    accessToken: string | null | undefined,
    { clientId }: { clientId: string | null | undefined }
  ) {
    this.accessToken = accessToken;
    this.clientId = clientId;
  }

  requestOptions(options: RequestOptions) {
    const newOptions: CoreOptions & UrlOptions = {
      method: options.method || 'GET',
      url: `${config.apiServer}${options.path}`,
      headers: options.headers || {},
      json: options.json == null ? true : options.json,
    };

    if (options.downloadRequest) {
      newOptions.encoding = null;
    }

    if (options.formData) {
      newOptions.formData = options.formData;
    } else {
      newOptions.body = options.body || {};
    }

    // For convenience, If `expanded` param is provided, convert to view:
    // 'expanded' api option
    if (options.qs) {
      newOptions.qs = { ...options.qs };
      if (newOptions.qs.expanded) {
        if (newOptions.qs.expanded === true) {
          newOptions.qs.view = 'expanded';
        }
        delete newOptions.qs.expanded;
      }
    }

    const user =
      options.path.substr(0, 3) === '/a/'
        ? config.clientSecret
        : this.accessToken;
    if (user) {
      newOptions.auth = {
        user: user,
        pass: '',
        sendImmediately: true,
      };
    }

    if (newOptions.headers) {
      if (newOptions.headers['User-Agent'] == null) {
        newOptions.headers['User-Agent'] = `Nylas Node SDK v${SDK_VERSION}`;
      }
      newOptions.headers['Nylas-API-Version'] = SUPPORTED_API_VERSION;
      newOptions.headers['Nylas-SDK-API-Version'] = SUPPORTED_API_VERSION;
      newOptions.headers['X-Nylas-Client-Id'] = this.clientId;
    }

    return newOptions;
  }

  _getWarningForVersion(sdkApiVersion?: string, apiVersion?: string) {
    let warning = '';

    if (sdkApiVersion != apiVersion) {
      if (sdkApiVersion && apiVersion) {
        warning +=
          `WARNING: SDK version may not support your Nylas API version.` +
          ` SDK supports version ${sdkApiVersion} of the API and your application` +
          ` is currently running on version ${apiVersion} of the API.`;

        const apiNum = parseInt(apiVersion.split('-')[0]);
        const sdkNum = parseInt(sdkApiVersion.split('-')[0]);

        if (sdkNum > apiNum) {
          warning += ` Please update the version of the API that your application is using through the developer dashboard.`;
        } else if (apiNum > sdkNum) {
          warning += ` Please update the sdk to ensure it works properly.`;
        }
      }
    }
    return warning;
  }

  request(options: RequestOptions) {
    const resolvedOptions = this.requestOptions(options);

    return new Promise<any>((resolve, reject) => {
      return request(resolvedOptions, (error, response, body = {}) => {
        if (typeof response === 'undefined') {
          error = error || new Error('No response');
          return reject(error);
        }
        // node headers are lowercase so this refers to `Nylas-Api-Version`
        const apiVersion = response.headers['nylas-api-version'] as
          | string
          | undefined;

        const warning = this._getWarningForVersion(
          SUPPORTED_API_VERSION,
          apiVersion
        );
        if (warning) {
          console.warn(warning);
        }

        // raw MIMI emails have json === false and the body is a string so
        // we need to turn into JSON before we can access fields
        if (resolvedOptions.json === false) {
          body = JSON.parse(body);
        }

        if (error || response.statusCode > 299) {
          if (!error) {
            error = new Error(body.message);
          }
          if (body.missing_fields) {
            error.message = `${body.message}: ${body.missing_fields}`;
          }
          if (body.server_error) {
            error.message = `${error.message} (Server Error:
              ${body.server_error}
            )`;
          }
          if (response.statusCode) {
            error.statusCode = response.statusCode;
          }
          return reject(error);
        } else {
          if (options.downloadRequest) {
            return resolve(response);
          } else {
            return resolve(body);
          }
        }
      });
    });
  }
}
