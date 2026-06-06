"use client"

import * as React from "react"
import { DayPicker } from "@daypicker/react"
import "@daypicker/react/style.css"

import { cn } from "@/lib/utils"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({
  className,
  ...props
}: CalendarProps) {
  return (
    <div className={cn("p-3", className)}>
      <DayPicker animate {...props} />
    </div>
  )
}
Calendar.displayName = "Calendar"

export { Calendar }
