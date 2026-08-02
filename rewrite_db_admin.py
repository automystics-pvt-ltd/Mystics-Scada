import re

with open('artifacts/solar-scada/src/pages/superadmin-db-admin.tsx', 'r') as f:
    content = f.read()

# Apply common visual replacements
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
    (r'shadow-2xl', r'shadow-[0_0_30px_rgba(0,195,255,0.15)] backdrop-blur-xl'),
    (r'shadow-xl', r'shadow-[0_0_30px_rgba(239,68,68,0.15)] backdrop-blur-xl'),
    
    # Typography
    (r'text-sm', r'font-mono text-[10px] uppercase tracking-widest'),
    (r'text-xs', r'font-mono text-[9px] uppercase tracking-widest'),
    (r'text-\[11px\]', r'font-mono text-[9px] uppercase tracking-widest'),
    (r'font-semibold', r'font-bold'),
    (r'font-medium', r'font-bold'),
    
    # Header area
    (r'<Database className="h-6 w-6 text-primary" />\s*Database Administration Console', 
     r'<Database className="h-6 w-6 text-accent-brand" /> DATABASE CONSOLE'),
    (r'Schema inspector · Record browser · SQL console · Connections · Integrity · Maintenance',
     r'SCHEMA INSPECTOR // RECORD BROWSER // SQL CONSOLE // CONNECTIONS // INTEGRITY // MAINTENANCE'),
    (r'<div className="flex items-start justify-between">',
     r'<div className="flex items-start justify-between border-b border-border/50 pb-4 relative"><div className="absolute bottom-0 left-0 w-1/4 h-[1px] bg-accent-brand shadow-[0_0_15px_rgba(0,195,255,0.8)]" />'),
    (r'<h1 className="text-2xl font-bold flex items-center gap-2">',
     r'<h1 className="font-mono text-2xl font-bold flex items-center gap-3 text-foreground uppercase tracking-widest">'),
    
    # Colors
    (r'text-primary', r'text-accent-brand'),
    (r'bg-primary/10', r'bg-accent-brand/10'),
    (r'bg-primary/15', r'bg-accent-brand/15'),
    (r'border-primary/20', r'border-accent-brand/30'),
    (r'border-primary/30', r'border-accent-brand/30'),
    (r'border-primary/50', r'border-accent-brand/50'),
    (r'border-primary', r'border-accent-brand'),
    (r'bg-primary(?!/)', r'bg-accent-brand'),
    
    # TABS
    (r'border-b-2 transition-colors \$\{\n\s*tab === t\.id\n\s*\? "border-primary text-primary"\n\s*: "border-transparent text-muted-foreground hover:text-foreground hover:border-border"\n\s*\}',
     r'transition-colors ${tab === t.id ? "bg-accent-brand/10 text-accent-brand border-accent-brand border" : "border border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5"}'),
    (r'border-b border-border', r''), # Remove default tab border
    
    # Modal specific
    (r'bg-black/60 backdrop-blur-sm', r'bg-black/95 backdrop-blur-md'),
    (r'border border-border/50 rounded-none shadow-\[0_0_30px_rgba\(0,195,255,0\.15\)\] backdrop-blur-xl w-full max-w-2xl max-h-\[85vh\] flex flex-col',
     r'bg-black/95 border border-accent-brand/50 rounded-none shadow-[0_0_30px_rgba(0,195,255,0.15)] backdrop-blur-xl w-full max-w-2xl max-h-[85vh] flex flex-col'),
    
    # Inputs
    (r'bg-background border border-border/50 rounded-none px-2 py-1\.5',
     r'bg-black/50 border border-border/50 rounded-none px-2 py-1.5 focus-visible:ring-accent-brand'),
    (r'bg-background text-sm px-3 py-2',
     r'bg-black/60 font-mono text-[9px] uppercase tracking-widest rounded-none h-8 px-3 focus:outline-none focus:ring-1 focus:ring-accent-brand'),
    
    # Buttons
    (r'bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80 border border-border/50',
     r'bg-white/5 border border-border/50 hover:bg-white/10 text-muted-foreground hover:text-foreground rounded-none'),
    
    # Misc visual flair
    (r'bg-muted/50', r'bg-black/60'),
    (r'bg-muted/30', r'bg-black/40'),
    (r'bg-muted/20', r'bg-white/5'),
    (r'bg-muted', r'bg-white/10'),
    (r'border-border/40', r'border-border/30'),
    (r'text-sm font-semibold', r'font-mono text-[10px] uppercase tracking-widest font-bold text-foreground'),
    (r'text-sm font-medium', r'font-mono text-[9px] uppercase tracking-widest font-bold text-muted-foreground'),
]

for old, new in replacements:
    content = re.sub(old, new, content)

with open('artifacts/solar-scada/src/pages/superadmin-db-admin.tsx', 'w') as f:
    f.write(content)
