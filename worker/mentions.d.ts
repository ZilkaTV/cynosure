export interface MentionMember {
  openfront_id: string
  in_game_name: string
}
export interface MentionSpan {
  start: number
  end: number
  id: string
}
export function nameVariants(name: string): string[]
export function scanMentions(body: string, members: MentionMember[]): MentionSpan[]
export function splitMentions(body: string, members: MentionMember[]): { text: string; id?: string }[]
export function mentionedIds(body: string, members: MentionMember[], authorId: string): string[]
export function mentionStatements(db: unknown, args: { table: string; kind: 'game' | 'profile'; ref: string; authorId: string; body: string }): Promise<unknown[]>
