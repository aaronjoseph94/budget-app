import { useState } from 'react'
import { navigate } from '../nav.js'
import { Button } from '../components/ui/button.js'
import { Input } from '../components/ui/form.js'
import { Icon } from '../components/ui/icons.js'
import { handOver } from '../ask/handoff.js'

/**
 * The Coach's ask box (plan §2.3, A24): a question typed here is answered
 * on Ask. It sits in the page's flow, not fixed to the screen's foot, so the
 * iPhone's keyboard scrolls it into view rather than sliding over it (§9).
 */
export function AskBox() {
  const [text, setText] = useState('')
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (text.trim() === '') return
        handOver(text)
        navigate('ask')
      }}
    >
      <label htmlFor="coach-ask" className="flex items-center gap-1.5 text-sm font-medium">
        <Icon name="sparkles" className="size-4 shrink-0" /> Ask anything about your money
      </label>
      <div className="flex gap-2">
        <Input
          id="coach-ask"
          className="min-w-0 flex-1"
          placeholder="e.g. coffee in August?"
          value={text}
          maxLength={300}
          autoComplete="off"
          enterKeyHint="go"
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="outline" className="min-h-11 shrink-0">
          Ask
        </Button>
      </div>
    </form>
  )
}
