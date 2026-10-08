# Mockup A style (from the owner's screenshot, 2026-09-28)

Light shadcn-like desktop app. Canvas #F4F4F6; main panel white, 1px #E5E7EB border, radius 16. Body face: ui-sans-serif/system-ui (as index.css). Ink #111827, muted #6B7280, faint #9CA3AF.
Accent (tweakable, default Indigo #4F46E5 / tint #EEF2FF): brand tile, "+ Add", active Month icon, goal progress, Start card tint.
Sidebar (248px, canvas bg): Budget brand; groups Plan (Week, Month, Year, Paycheck, Bill calendar since ADR 0014) · Money (Savings, Debts, All transactions) · Inbox (Review [orange count], Add) · More (Settings, Help; since ADR 0014). Active row: white card + border, radius 12. Icons coloured per item. Bottom: main-goal card (plane, name, %, bar, "$X of $Y") and user row (avatar, name, email, sign-out).
Top bar (64px, border-bottom): sidebar toggle · breadcrumb "Budget › Month" · search "Search or jump to… ⌘K" · [+ Add].
Title 32px/700; subtitle muted 16px; right: ‹ [📅 Sep 2026] ›.
Banner amber: bg #FFFBEB, border #FDE68A, ink #92400E, icon tile #FEF3C7/#D97706; right link "Review ›".
Stat cards (4-up, radius 16, border, tinted gradient to bottom): Start (indigo #EEF0FF, wallet), Spent (rose #FFF1F2, icon #E11D48 on #FFE4E6), Left to spend (green #ECFDF5, #10B981 on #D1FAE5, progress), End of month (sky #EFF6FF, #0EA5E9 on #E0F2FE). Label 16px muted, value 32px/700, note 15px muted.
List cards: icon tile + title 18px/600 + "$actual of $budget" + % pill; progress bar in list colour; table header row tinted; rows: name with mini bar under it, Budgeted/Actual (planned under)/Left; negative Left = rose pill white text. Colours: Variable orange #F97316 (#FFEDD5/#FFF7ED, pill ink #C2410C); Bills sky #0EA5E9 (#E0F2FE/#F0F9FF, #0369A1); Subscriptions violet #8B5CF6; Debts rose #E11D48; Income green #10B981; Savings amber #F59E0B.
Charts: Income against goals = green bars on #D1FAE5 with "$X of $Y"; Variable by category = donut (orange, pink, violet, blue, teal, green) with "$1,012.56 spent" in the middle.
