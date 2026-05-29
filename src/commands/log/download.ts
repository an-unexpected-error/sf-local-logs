import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('sf-local-logs', 'log.download');

export type DownloadResult = {
  logs: Array<{ id: string; size: number; location: string }>;
};

export default class Download extends SfCommand<DownloadResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    'api-version': Flags.orgApiVersion(),
  };

  public async run(): Promise<DownloadResult> {
    await this.parse(Download);
    this.log('Log download coming in Phase 3');
    return { logs: [] };
  }
}
