// Removed incorrect import of Literal and Union from 'typescript'

// Define MediaRef type
export class MediaRef {
  kind: 'url' | 'file_id' | 'data' = 'url';
  url?: string;
  file_id?: string;
  data_base64?: string;
  mime_type?: string;
  size_bytes?: number;
  sha256?: string;
  filename?: string;
  width?: number;
  height?: number;
  duration_ms?: number;
  page?: number;

  constructor(
    kind: 'url' | 'file_id' | 'data' = 'url',
    url?: string,
    file_id?: string,
    data_base64?: string,
    mime_type?: string,
    size_bytes?: number,
    sha256?: string,
    filename?: string,
    width?: number,
    height?: number,
    duration_ms?: number,
    page?: number
  ) {
    this.kind = kind;
    this.url = url;
    this.file_id = file_id;
    this.data_base64 = data_base64;
    this.mime_type = mime_type;
    this.size_bytes = size_bytes;
    this.sha256 = sha256;
    this.filename = filename;
    this.width = width;
    this.height = height;
    this.duration_ms = duration_ms;
    this.page = page;
  }
}

// Define AnnotationRef type
export class AnnotationRef {
  url?: string;
  file_id?: string;
  page?: number;
  index?: number;
  title?: string;

  constructor(url?: string, file_id?: string, page?: number, index?: number, title?: string) {
    this.url = url;
    this.file_id = file_id;
    this.page = page;
    this.index = index;
    this.title = title;
  }
}

// Define TextBlock type
export class TextBlock {
  type: 'text' = 'text';
  text: string = '';
  annotations: AnnotationRef[] = [];

  constructor(text: string = '', annotations: AnnotationRef[] = []) {
    this.text = text;
    this.annotations = annotations;
  }
}

// Define ImageBlock type
export class ImageBlock {
  type: 'image' = 'image';
  media: MediaRef = new MediaRef();
  alt_text?: string;
  bbox?: number[];

  constructor(media: MediaRef = new MediaRef(), alt_text?: string, bbox?: number[]) {
    this.media = media;
    this.alt_text = alt_text;
    this.bbox = bbox;
  }
}

// Define AudioBlock type
export class AudioBlock {
  type: 'audio' = 'audio';
  media: MediaRef = new MediaRef();
  transcript?: string;
  sample_rate?: number;
  channels?: number;

  constructor(
    media: MediaRef = new MediaRef(),
    transcript?: string,
    sample_rate?: number,
    channels?: number
  ) {
    this.media = media;
    this.transcript = transcript;
    this.sample_rate = sample_rate;
    this.channels = channels;
  }
}

// Define VideoBlock type
export class VideoBlock {
  type: 'video' = 'video';
  media: MediaRef = new MediaRef();
  thumbnail?: MediaRef;

  constructor(media: MediaRef = new MediaRef(), thumbnail?: MediaRef) {
    this.media = media;
    this.thumbnail = thumbnail;
  }
}

// Define DocumentBlock type
export class DocumentBlock {
  type: 'document' = 'document';
  media: MediaRef = new MediaRef();
  pages?: number[];
  excerpt?: string;

  constructor(media: MediaRef = new MediaRef(), pages?: number[], excerpt?: string) {
    this.media = media;
    this.pages = pages;
    this.excerpt = excerpt;
  }
}

// Define DataBlock type
export class DataBlock {
  type: 'data' = 'data';
  mime_type: string = '';
  data_base64?: string;
  media?: MediaRef;

  constructor(mime_type: string = '', data_base64?: string, media?: MediaRef) {
    this.mime_type = mime_type;
    this.data_base64 = data_base64;
    this.media = media;
  }
}

// Define ToolCallBlock type
export class ToolCallBlock {
  type: 'tool_call' = 'tool_call';
  id: string = '';
  name: string = '';
  args: Record<string, any> = {};
  tool_type?: string;

  constructor(
    id: string = '',
    name: string = '',
    args: Record<string, any> = {},
    tool_type?: string
  ) {
    this.id = id;
    this.name = name;
    this.args = args;
    this.tool_type = tool_type;
  }
}

// Define RemoteToolCallBlock type
export class RemoteToolCallBlock {
  type: 'remote_tool_call' = 'remote_tool_call';
  id: string = '';
  name: string = '';
  args: Record<string, any> = {};
  tool_type: string = 'remote';

  constructor(
    id: string = '',
    name: string = '',
    args: Record<string, any> = {},
    tool_type: string = 'remote'
  ) {
    this.id = id;
    this.name = name;
    this.args = args;
    this.tool_type = tool_type;
  }
}

// Define ToolResultBlock type
export class ToolResultBlock {
  type: 'tool_result' = 'tool_result';
  call_id: string = '';
  /** Name of the tool that produced the result. Absent on results saved before the server set it. */
  name?: string;
  output: any;
  is_error: boolean = false;
  status?: 'completed' | 'failed';

  constructor(props: {
    call_id: string;
    name?: string;
    output: any;
    status: 'completed' | 'failed';
    is_error: boolean;
  }) {
    this.call_id = props.call_id;
    this.name = props.name;
    this.output = props.output;
    this.status = props.status;
    this.is_error = props.is_error;
  }
}

// Define ReasoningBlock type
export class ReasoningBlock {
  type: 'reasoning' = 'reasoning';
  summary: string = '';
  details?: string[];

  constructor(summary: string = '', details?: string[]) {
    this.summary = summary;
    this.details = details;
  }
}

// Define AnnotationBlock type
export class AnnotationBlock {
  type: 'annotation' = 'annotation';
  kind: 'citation' | 'note' = 'citation';
  refs: AnnotationRef[] = [];
  spans?: [number, number][];

  constructor(
    kind: 'citation' | 'note' = 'citation',
    refs: AnnotationRef[] = [],
    spans?: [number, number][]
  ) {
    this.kind = kind;
    this.refs = refs;
    this.spans = spans;
  }
}

// Define ErrorBlock type
export class ErrorBlock {
  type: 'error' = 'error';
  message: string = '';
  code?: string;
  data?: Record<string, any>;

  constructor(message: string = '', code?: string, data?: Record<string, any>) {
    this.message = message;
    this.code = code;
    this.data = data;
  }
}

// Define ContentBlock union type
export type ContentBlock =
  | TextBlock
  | ImageBlock
  | AudioBlock
  | VideoBlock
  | DocumentBlock
  | DataBlock
  | ToolCallBlock
  | RemoteToolCallBlock
  | ToolResultBlock
  | ReasoningBlock
  | AnnotationBlock
  | ErrorBlock;

// Define TokenUsages type
export class TokenUsages {
  completion_tokens: number = 0;
  prompt_tokens: number = 0;
  total_tokens: number = 0;
  reasoning_tokens: number = 0;
  cache_creation_input_tokens: number = 0;
  cache_read_input_tokens: number = 0;
  image_tokens?: number = 0;
  audio_tokens?: number = 0;
}

// Define Message class
export class Message {
  message_id: string | null = null;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: ContentBlock[] = [];
  delta: boolean = false;
  tools_calls?: Record<string, any>[];
  timestamp: number = Date.now();
  metadata: Record<string, any> = {};
  usages?: TokenUsages;
  raw?: Record<string, any>;

  constructor(
    role: 'user' | 'assistant' | 'system' | 'tool',
    content: ContentBlock[],
    message_id: string | null = null
  ) {
    this.role = role;
    this.content = content;
    this.message_id = message_id;
  }

  static text_message(
    content: string,
    role: 'user' | 'assistant' | 'system' | 'tool' = 'user',
    message_id: string | null = null
  ): Message {
    return new Message(role, [{ type: 'text', text: content } as TextBlock], message_id);
  }

  static tool_message(
    content: ContentBlock[],
    message_id: string | null = null,
    meta: Record<string, any> = {}
  ): Message {
    const message = new Message('tool', content, message_id);
    message.metadata = meta;
    return message;
  }

  text(): string {
    return this.content
      .map((block) => {
        if (block.type === 'text') {
          return (block as TextBlock).text;
        } else if (block.type === 'tool_result') {
          const output = (block as ToolResultBlock).output;
          return typeof output === 'string' ? output : JSON.stringify(output);
        }
        return '';
      })
      .join('');
  }

  attach_media(media: MediaRef, as_type: 'image' | 'audio' | 'video' | 'document'): void {
    let block: ContentBlock;
    switch (as_type) {
      case 'image':
        block = { type: 'image', media } as ImageBlock;
        break;
      case 'audio':
        block = { type: 'audio', media } as AudioBlock;
        break;
      case 'video':
        block = { type: 'video', media } as VideoBlock;
        break;
      case 'document':
        block = { type: 'document', media } as DocumentBlock;
        break;
      default:
        throw new Error(`Unsupported media type: ${as_type}`);
    }
    this.content.push(block);
  }

  // ------------------------------------------------------------------
  // Multimodal convenience constructors (Sprint 5.3)
  // ------------------------------------------------------------------

  /**
   * Create a message with an image (via URL or base64).
   *
   * @example
   * ```ts
   * const msg = Message.withImage('Describe this', 'https://example.com/photo.jpg');
   * const msg2 = Message.withImage('Describe this', 'data:image/png;base64,...');
   * ```
   */
  static withImage(
    text: string,
    imageUrl: string,
    role: 'user' | 'assistant' | 'system' = 'user'
  ): Message {
    return new Message(role, [
      new TextBlock(text),
      new ImageBlock(new MediaRef('url', imageUrl, undefined, undefined, undefined)),
    ]);
  }

  /**
   * Create a message with a file reference (e.g. from uploadFile result).
   *
   * @example
   * ```ts
   * const upload = await client.uploadFile(pdfFile);
   * const msg = Message.withFile('Summarize this PDF', upload.data.file_id, 'application/pdf');
   * ```
   */
  static withFile(
    text: string,
    fileId: string,
    mimeType?: string,
    role: 'user' | 'assistant' | 'system' = 'user'
  ): Message {
    const media = new MediaRef('file_id', undefined, fileId, undefined, mimeType);
    const isImage = mimeType?.startsWith('image/');
    const isAudio = mimeType?.startsWith('audio/');
    const isVideo = mimeType?.startsWith('video/');

    let block: ContentBlock;
    if (isImage) {
      block = new ImageBlock(media);
    } else if (isAudio) {
      block = new AudioBlock(media);
    } else if (isVideo) {
      block = new VideoBlock(media);
    } else {
      block = new DocumentBlock(media);
    }

    return new Message(role, [new TextBlock(text), block]);
  }

  /**
   * Create a multimodal message with arbitrary content blocks.
   *
   * @example
   * ```ts
   * const msg = Message.multimodal([
   *   new TextBlock('Look at these'),
   *   new ImageBlock(new MediaRef('url', 'https://...')),
   *   new ImageBlock(new MediaRef('url', 'https://...')),
   * ]);
   * ```
   */
  static multimodal(
    blocks: ContentBlock[],
    role: 'user' | 'assistant' | 'system' = 'user'
  ): Message {
    return new Message(role, blocks);
  }
}
