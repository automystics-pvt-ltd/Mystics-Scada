import re

with open('artifacts/solar-scada/src/pages/superadmin-config.tsx', 'r') as f:
    content = f.read()

replacements = [
    # General UI styles
    (r'bg-card', r'bg-black/40'),
    (r'border-border(?!/)', r'border-border/50'),
    (r'rounded-xl', r'rounded-none'),
    (r'rounded-lg', r'rounded-none'),
    (r'rounded-md', r'rounded-none'),
    (r'rounded-full', r'rounded-none'),
    (r'rounded', r'rounded-none'),
    
    # Typography
    (r'text-sm font-semibold', r'font-mono text-[10px] uppercase tracking-widest font-bold text-foreground'),
    (r'text-sm font-medium', r'font-mono text-[9px] uppercase tracking-widest font-bold text-foreground'),
    (r'text-sm', r'font-mono text-[9px] uppercase tracking-widest'),
    (r'text-xs text-muted-foreground', r'font-mono text-[8px] uppercase tracking-widest text-muted-foreground'),
    
    # Header area
    (r'<div className="flex items-center justify-between">',
     r'<div className="flex items-center justify-between border-b border-border/50 pb-4 relative"><div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />'),
    (r'<h1 className="text-2xl font-bold flex items-center gap-2">',
     r'<h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">'),
    
    # Colors
    (r'text-primary', r'text-accent-brand'),
    (r'bg-primary/10', r'bg-accent-brand/10'),
    (r'bg-primary/15', r'bg-accent-brand/15'),
    (r'bg-primary', r'bg-accent-brand'),
    (r'border-primary', r'border-accent-brand'),
    
    # TABS
    (r'border-b-2 transition-colors \$\{\n\s*tab === t\.id\n\s*\? "border-primary text-primary"\n\s*: "border-transparent text-muted-foreground hover:text-foreground"\n\s*\}',
     r'transition-colors ${tab === t.id ? "bg-accent-brand/10 text-accent-brand border-accent-brand border" : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5"}'),
    
    # Inputs
    (r'bg-background border border-border/50 rounded-none px-2 py-1\.5',
     r'bg-black/50 border border-border/50 rounded-none px-2 py-1.5 focus-visible:ring-accent-brand'),
    (r'bg-background text-sm px-3 py-2',
     r'bg-black/60 font-mono text-[9px] uppercase tracking-widest rounded-none h-8 px-3 focus:outline-none focus:ring-1 focus:ring-accent-brand'),
    
    # Misc visual flair
    (r'bg-muted/50', r'bg-black/60'),
    (r'bg-muted/30', r'bg-black/40'),
    (r'bg-muted/20', r'bg-white/5'),
    (r'bg-muted', r'bg-white/10'),
]

for old, new in replacements:
    content = re.sub(old, new, content)

with open('artifacts/solar-scada/src/pages/superadmin-config.tsx', 'w') as f:
    f.write(content)
