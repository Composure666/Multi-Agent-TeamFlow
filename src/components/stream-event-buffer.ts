import type { StreamEvent } from '@/shared/types'

type PartDeltaEvent = Extract<StreamEvent, { type: 'part.delta' }>

export class StreamEventBuffer {
  private pending: PartDeltaEvent | null = null

  constructor(private readonly apply: (event: StreamEvent) => void) {}

  push(event: StreamEvent): void {
    if (event.type !== 'part.delta') {
      this.flush()
      this.apply(event)
      return
    }

    if (this.pending && canMerge(this.pending, event)) {
      this.pending = {
        ...event,
        delta: {
          type: event.delta.type,
          text: this.pending.delta.text + event.delta.text,
        },
      }
      return
    }

    this.flush()
    this.pending = event
  }

  flush(): void {
    if (!this.pending) return
    this.apply(this.pending)
    this.pending = null
  }
}

function canMerge(a: PartDeltaEvent, b: PartDeltaEvent): boolean {
  return (
    a.conversationId === b.conversationId &&
    a.messageId === b.messageId &&
    a.partIndex === b.partIndex &&
    a.delta.type === b.delta.type
  )
}
