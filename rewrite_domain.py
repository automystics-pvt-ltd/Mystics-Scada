import re
import sys

def rewrite(filepath):
    with open(filepath, 'r') as f:
        content = f.read()

    replacements = [
        # General UI styles
        (r'bg-card', r'bg-black/40'),
        (r'border-border(?!/)', r'border-border/50'),
        (r'border-b-2', r'border-b'),
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
        (r'text-xs', r'font-mono text-[8px] uppercase tracking-widest'),
        
        # Colors
        (r'text-primary', r'text-accent-brand'),
        (r'bg-primary/10', r'bg-accent-brand/10'),
        (r'bg-primary/15', r'bg-accent-brand/15'),
        (r'bg-primary(?!/)', r'bg-accent-brand'),
        (r'border-primary', r'border-accent-brand'),
        
        # Header block replacement (fuzzy)
        (r'<div className="flex items-center justify-between">',
         r'<div className="flex items-center justify-between border-b border-border/50 pb-4 relative"><div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />'),
        (r'<h1 className="text-2xl font-bold flex items-center gap-2">',
         r'<h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">'),
        
        # Misc visual flair
        (r'bg-muted/50', r'bg-black/60'),
        (r'bg-muted/30', r'bg-black/40'),
        (r'bg-muted/20', r'bg-white/5'),
        (r'bg-muted/10', r'bg-white/5'),
        (r'bg-muted', r'bg-white/10'),
    ]

    for old, new in replacements:
        content = re.sub(old, new, content)

    with open(filepath, 'w') as f:
        f.write(content)

for p in ['artifacts/solar-scada/src/pages/weather.tsx', 
          'artifacts/solar-scada/src/pages/string-diagnostics.tsx',
          'artifacts/solar-scada/src/pages/combiner-strings.tsx']:
    rewrite(p)
