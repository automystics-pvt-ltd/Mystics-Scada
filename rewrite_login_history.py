import re

with open('artifacts/solar-scada/src/pages/superadmin-login-history.tsx', 'r') as f:
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
    
    # Header area
    (r'<div className="flex items-center justify-between">',
     r'<div className="flex items-center justify-between border-b border-border/50 pb-4 relative"><div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />'),
    (r'<h1 className="text-2xl font-bold flex items-center gap-2">',
     r'<h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">'),
    
    # Typography
    (r'text-sm font-semibold', r'font-mono text-[10px] uppercase tracking-widest font-bold text-foreground'),
    (r'text-sm font-medium', r'font-mono text-[9px] uppercase tracking-widest font-bold text-foreground'),
    (r'text-sm', r'font-mono text-[9px] uppercase tracking-widest'),
    (r'text-xs text-muted-foreground', r'font-mono text-[8px] uppercase tracking-widest text-muted-foreground'),
    (r'text-xs', r'font-mono text-[8px] uppercase tracking-widest'),
    
    # Colors
    (r'text-primary', r'text-accent-brand'),
    (r'bg-primary/10', r'bg-accent-brand/10'),
    (r'bg-primary/15', r'bg-accent-brand/15'),
    (r'bg-primary(?!/)', r'bg-accent-brand'),
    (r'border-primary', r'border-accent-brand'),
    
    # Inputs
    (r'bg-background border border-border/50 rounded-none px-2 py-1\.5',
     r'bg-black/50 border border-border/50 rounded-none px-2 py-1.5 focus-visible:ring-accent-brand'),
    
    # Buttons
    (r'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
     r'border-border/50 text-muted-foreground hover:border-accent-brand/50 hover:text-accent-brand'),
    (r'bg-primary text-primary-foreground border-primary', r'bg-accent-brand/10 text-accent-brand border-accent-brand font-bold'),
    
    # Misc visual flair
    (r'bg-muted/50', r'bg-black/60'),
    (r'bg-muted/30', r'bg-black/40'),
    (r'bg-muted/20', r'bg-white/5'),
    (r'bg-muted/10', r'bg-white/5'),
    (r'bg-muted', r'bg-white/10'),
]

for old, new in replacements:
    content = re.sub(old, new, content)

with open('artifacts/solar-scada/src/pages/superadmin-login-history.tsx', 'w') as f:
    f.write(content)
