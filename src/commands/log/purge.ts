import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('sf-local-logs', 'log.purge');

export type PurgeResult = {
  deleted: number;
  freedBytes: number;
};

export default class Purge extends SfCommand<PurgeResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    'api-version': Flags.orgApiVersion(),
  };

  public async run(): Promise<PurgeResult> {
    await this.parse(Purge);
    this.log('Log purge coming in Phase 3');
    return { deleted: 0, freedBytes: 0 };
  }
}
