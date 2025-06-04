import { Provider, ProviderResult, IAgentRuntime, Memory, State } from '@elizaos/core';

export const twitterListProvider: Provider = {
  name: 'TWITTER_LIST_PROVIDER',
  description: 'Provides context about monitored Twitter lists and RSS feed status',

  get: async (
    runtime: IAgentRuntime,
    _message: Memory,
    _state: State
  ): Promise<ProviderResult> => {
    const lists = (
      runtime.getSetting?.('TWITTER_LISTS') || process.env.TWITTER_LISTS || ''
    )
      .split(',')
      .filter(Boolean);
    const updateInterval =
      runtime.getSetting?.('RSS_UPDATE_INTERVAL') || process.env.RSS_UPDATE_INTERVAL || '30';

    return {
      text: `Monitoring ${lists.length} Twitter lists with ${updateInterval}-minute update intervals`,
      values: {
        monitoredLists: lists,
        updateInterval,
        totalLists: lists.length,
      },
      data: {
        lists: lists.map((id) => id.trim()),
        interval: updateInterval,
        count: lists.length,
      },
    };
  },
};
