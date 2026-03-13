import { Module } from '@nestjs/common';

import { FakeSummarizationProvider } from './fake-summarization.provider';
import { GeminiSummarizationProvider } from './gemini-summarization.provider';
import { SUMMARIZATION_PROVIDER } from './summarization-provider.interface';

const providerFactory = {
  provide: SUMMARIZATION_PROVIDER,
  useFactory: (): FakeSummarizationProvider | GeminiSummarizationProvider => {
    const isTestEnv = process.env.NODE_ENV === 'test';
    const apiKey = process.env.GEMINI_API_KEY;

    if (isTestEnv || !apiKey) {
      return new FakeSummarizationProvider();
    }

    return new GeminiSummarizationProvider();
  },
};

@Module({
  providers: [FakeSummarizationProvider, GeminiSummarizationProvider, providerFactory],
  exports: [SUMMARIZATION_PROVIDER],
})
export class LlmModule {}
