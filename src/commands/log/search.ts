import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

Messages.importMessagesDirectory(__dirname);
const messages = Messages.loadMessages('sf-local-logs', 'log.search');

export type SearchResult = {
  results: Array<{ id: string; name: string; email: string; lastLogin: string }>;
};

export default class Search extends SfCommand<SearchResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg(),
    'api-version': Flags.orgApiVersion(),
    name: Flags.string({
      char: 'n',
      summary: 'User name to search for',
      required: false,
    }),
  };

  public async run(): Promise<SearchResult> {
    await this.parse(Search);
    this.log('User search coming in Phase 1');
    return { results: [] };
  }
}
