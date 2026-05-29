import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('sf-local-logs', 'log.trace');

export type TraceResult = {
  traceFlag: { id: string; expirationDate: string; debugLevel: string } | null;
};

export default class Trace extends SfCommand<TraceResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    'api-version': Flags.orgApiVersion(),
    'user-id': Flags.string({
      summary: 'Salesforce user ID to trace',
      required: false,
    }),
  };

  public async run(): Promise<TraceResult> {
    await this.parse(Trace);
    this.log('Debug tracing coming in Phase 2');
    return { traceFlag: null };
  }
}
