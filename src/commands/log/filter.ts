import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('sf-local-logs', 'log.filter');

export default class Filter extends SfCommand<Record<string, never>> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {};

  public async run(): Promise<Record<string, never>> {
    this.log('Use `sf log trace --keyword <keyword>` to filter downloaded logs. The standalone filter command is not available in v1.');
    return {};
  }
}
