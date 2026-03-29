# Privacy Policy for Moraya

**Effective Date:** March 28, 2026

[moraya.app](https://moraya.app) develops and distributes Moraya, an open-source AI-powered Markdown editor (the "Software"). This Software is provided by moraya.app and is intended for use as is.

This Privacy Policy informs you of our policies regarding the collection, use, and disclosure of information when you use Moraya. By using Moraya, you agree to the collection and use of information in accordance with this policy.

The terms used in this Privacy Policy have the same meanings as in our Terms of Service (if any), accessible via our documentation or website, unless otherwise defined here.

This Privacy Policy applies only to the use of the Moraya Software itself. Visiting our official website (moraya.app), documentation, GitHub repository, or other related sites is governed by their respective privacy policies (if any).

## Information Collection and Use

Moraya is designed to operate primarily locally on your device with minimal data collection. **We do not collect any personal or usage data by default.**

### Anonymous Usage Data (Optional)

Moraya does not enable anonymous usage statistics by default. If a future update introduces an optional "Send Anonymous Usage Info" setting in the preferences panel, the following will apply:

- Anonymous data will only be sent if you explicitly enable this option.
- You may disable it at any time (a restart may be required for changes to take effect).
- Collected data would be strictly anonymous and used solely for improving the Software, including:
  - Moraya version, operating system, screen resolution, locale, and approximate country (derived from IP address).
  - General operation names (e.g., "launch", "new document", "AI assist") for aggregate usage statistics. No detailed user-specific sequences or sensitive content will be collected.
  - Session duration.
  - Non-sensitive preference settings (e.g., theme, editor mode).

When errors occur, and if anonymous reporting is enabled, we may collect stack traces, relevant settings, and runtime state to diagnose issues. This data will not contain personal or sensitive information.

### No Personal Data Collection

Moraya does not collect, store, or transmit any personal identifiers, document content, or sensitive data to our servers unless explicitly initiated by you (e.g., via feedback or the third-party features described below).

## AI Features and Third-Party Services

Moraya includes built-in AI assistance supporting multiple providers: Claude (Anthropic), OpenAI, Gemini (Google), DeepSeek, Grok (xAI), Mistral, GLM (Zhipu AI), MiniMax, Doubao (ByteDance), custom OpenAI-compatible endpoints, and Ollama.

- **Cloud-based AI Models** (Claude, OpenAI, Gemini, DeepSeek, Grok, Mistral, GLM, MiniMax, Doubao, and custom endpoints):
  When you use these models, your selected text, prompt, or context is sent **directly** from your device to the respective third-party provider's servers for processing. Streaming responses are received in real-time.
  **We do not store, log, or access this data.** Transmission occurs only when you explicitly invoke an AI feature.
  These providers may collect and process your input according to their own privacy policies. We strongly recommend reviewing their policies:
  - Anthropic (Claude): https://www.anthropic.com/legal/privacy
  - OpenAI: https://openai.com/policies/privacy
  - Google Gemini: https://policies.google.com/privacy
  - DeepSeek: https://www.deepseek.com/privacy_policy
  - xAI (Grok): https://x.ai/legal/privacy-policy
  - Mistral: https://mistral.ai/privacy-policy
  - Zhipu AI (GLM): https://open.bigmodel.cn/privacy
  - MiniMax: Check their official site for the current policy
  - ByteDance (Doubao): https://www.volcengine.com/docs/82379/1263975

- **Local AI Model** (Ollama):
  When configured to use Ollama, all processing occurs entirely on your device. No data is sent externally.

- **Custom OpenAI-Compatible Endpoints**:
  When you configure a custom base URL, your data is sent to that endpoint. You are responsible for reviewing the privacy policy of the custom service you connect to.

Moraya does not automatically install or launch any third-party services. AI usage requires user configuration (e.g., API keys) and explicit activation.

### API Key Storage (Bring Your Own Key)

Moraya follows a **Bring Your Own Key (BYOK)** model — you provide your own API keys for the AI providers you choose to use. Your API keys are:

- **Stored exclusively on your device** in the operating system's native secure storage (macOS Keychain, Windows Credential Manager, or Linux Secret Service/libsecret). Keys are encrypted at rest by the OS.
- **Never transmitted to Moraya's servers.** We do not operate any server infrastructure that receives, stores, or processes your API keys.
- **Never included in logs, telemetry, error reports, or crash data.** API keys are resolved at runtime by the local Rust backend and are never exposed to the frontend or written to disk in plaintext.

You are responsible for obtaining and managing your own API keys from the respective providers.

### Direct Data Transfer (No Intermediary)

When you use AI features, your prompts and content are sent **directly from your device** to the selected provider's API endpoint. Specifically:

- **No relay or proxy servers.** Moraya does not operate any intermediary servers. There is no Moraya-hosted backend that your data passes through.
- **On-device authentication.** Moraya's local Rust backend retrieves your API key from the OS secure storage and injects the authentication header on your device — before the request leaves your machine.
- **Direct data path.** The network path is: **Your Device → Provider API** (e.g., `api.openai.com`, `api.anthropic.com`, `generativelanguage.googleapis.com`). No intermediate stops.
- **Direct response streaming.** Response data streams directly from the provider back to your device via the same direct connection.

This architecture ensures that Moraya never has access to your AI conversations or the ability to intercept, log, or analyze your prompts and responses.

We have no control over, and assume no responsibility for, the privacy practices of these third-party AI providers.

## Knowledge Base and Embedding

Moraya includes a local Knowledge Base feature that supports semantic (vector) search over your documents.

- **Index storage is fully local.** Vector indexes, BM25 indexes, and chunk metadata are stored in a `.moraya/indexes/` directory within your knowledge base folder on your device. No index data is uploaded to our servers.
- **Embedding API calls.** To build the vector index, Moraya sends document text chunks to the embedding API endpoint of your configured AI provider (e.g., OpenAI's `text-embedding-3-small`, or a local Ollama model). This occurs only when you explicitly trigger indexing. The same BYOK and direct-data-transfer principles described above apply.
- **Search queries.** When you perform a semantic search, your query text is sent to the same embedding provider to generate a query vector. No search history is stored on our servers.
- **Local offline models (if configured).** If you configure a local embedding model (e.g., via Ollama or a downloaded ONNX model), all indexing and search processing occurs entirely on your device.

## Voice Transcription

Moraya includes an AI-powered voice transcription feature supporting multiple providers: Deepgram, Gladia, AssemblyAI, and Azure Speech.

- **Audio data transmission.** When you use voice transcription, your microphone audio (captured as PCM audio via an AudioWorklet) is sent in real-time **directly from your device** to the transcription provider's servers via a Rust-side WebSocket proxy. We do not record, store, or access your audio data.
- **Provider policies.** Your audio may be processed according to each provider's privacy policy:
  - Deepgram: https://deepgram.com/privacy
  - Gladia: https://www.gladia.io/privacy-policy
  - AssemblyAI: https://www.assemblyai.com/legal/privacy-policy
  - Azure Speech: https://privacy.microsoft.com/en-us/privacystatement
- **API key storage.** Voice transcription API keys follow the same OS keychain storage model described above.
- **Local audio backup (if enabled).** If you enable the voice recording backup feature, audio segments are saved locally to a directory you specify on your device. This data is never uploaded to our servers.
- **Speaker profiles.** Voice speaker profiles (used for speaker identification) are stored locally in Moraya's settings on your device and are never transmitted.

## Image Hosting

Moraya supports uploading images to third-party object storage services for use in your documents. Supported providers include Qiniu Cloud, Aliyun OSS, Tencent COS, AWS S3, Google Cloud Storage (GCS), and GitHub.

- **Image data.** When you upload an image via Moraya, the image file is sent **directly from your device** to the storage service you have configured. Moraya's local Rust backend handles HMAC request signing using your credentials stored in the OS keychain — the signed request is sent directly to the provider's API.
- **No intermediary.** We do not operate image relay or CDN services. Moraya does not store copies of your uploaded images.
- **Credentials storage.** Object storage credentials (access keys, secret keys, tokens) are stored exclusively in the OS native secure storage, following the same BYOK model.
- **Provider policies.** Images uploaded to these services are governed by the respective provider's privacy and data policies.

## Publishing

Moraya supports publishing documents to GitHub (via the GitHub Contents API).

- **Content transmission.** When you publish a document, the document content is sent **directly from your device** to the GitHub API on your behalf.
- **GitHub token storage.** Your GitHub personal access token is stored in the OS native secure storage and is never transmitted to Moraya's servers.
- **GitHub's privacy policy.** Published content is subject to GitHub's Privacy Statement: https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement

## MCP Servers (Model Context Protocol)

Moraya supports connecting to MCP (Model Context Protocol) servers, which extend AI capabilities with external tools and resources.

- **stdio-based servers.** Local MCP servers launched as child processes run entirely on your device and communicate only via standard I/O. No network transmission occurs for the MCP protocol itself (though the tools invoked by the server may make their own network calls).
- **SSE and HTTP servers.** If you configure remote MCP servers (via SSE or HTTP transport), tool invocations and results are sent to the server URL you specify. You are responsible for reviewing the privacy practices of any remote MCP server you connect to.
- **User confirmation required.** Moraya requires your explicit confirmation before launching any stdio-based MCP server process for the first time.
- **We do not operate MCP servers** and have no visibility into any data exchanged between Moraya and user-configured MCP endpoints.

## External Resources and Links

Moraya supports embedding images, videos, iframes, and other resources from remote websites in your Markdown documents. When you open or preview such documents:

- These resources are loaded directly from their source URLs.
- The external sites may collect information about your request (e.g., IP address, user agent).

If your document contains links to third-party sites and you click them, you will be directed outside Moraya. We have no control over external sites and recommend reviewing their privacy policies.

## Log Data

Moraya generates minimal local logs on your device for debugging and performance purposes. These logs remain stored locally and are never transmitted unless you explicitly share them (e.g., during feedback).

## Backups and Local Storage

All documents, settings, knowledge base indexes, and backups created by Moraya are stored exclusively on your local device. Automatic backups (if enabled) are designed to prevent data loss and remain local. No data is uploaded to our servers.

## Feedback and Bug Reports

If you submit feedback, bug reports, or support requests (via GitHub, email, or other channels), you may voluntarily provide information such as system details, steps to reproduce, or sample files. You control what you share and may refuse or redact sensitive content.

Any shared files will be used solely for debugging and improvement purposes. We will not disclose them to third parties without your permission and will delete them upon request after resolution.

Communication channels (e.g., GitHub, email) are third-party services with their own privacy policies.

## Service Providers

We do not share your data with third-party companies or individuals except as described above (AI, voice transcription, image hosting, and publishing providers, each contacted directly from your device during active use).

## Security

We prioritize local-first design to minimize risks. All sensitive credentials are stored in OS-native secure storage, and all external communications are authenticated on-device before leaving your machine. However, no method of electronic storage or transmission is 100% secure. You are responsible for securing your device and all API keys and tokens you configure.

## Children's Privacy

Moraya is not intended for users under 13. We do not knowingly collect personal information from children under 13. If discovered, we will delete such information promptly. Parents/guardians should contact us if concerned.

## Changes to This Privacy Policy

We may update this Privacy Policy periodically. Changes will be posted on our website (moraya.app) or announced via update notes. Continued use of Moraya after changes constitutes acceptance.

## Contact Us

For questions or concerns about this Privacy Policy, please open an issue on our GitHub repository: https://github.com/zouwei/moraya/issues.

Thank you for using Moraya!
