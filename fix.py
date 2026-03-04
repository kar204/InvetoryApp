import os

directory = 'src'

replacements = [
    ('bg-[#0B0F19]', 'bg-slate-50 dark:bg-[#0B0F19]'),
    ('bg-[#111827]', 'bg-white dark:bg-[#111827]'),
    ('bg-[#151C2F]', 'bg-slate-50 dark:bg-[#151C2F]'),
    ('bg-[#1B2438]', 'bg-slate-100 dark:bg-[#1B2438]'),
    ('text-white', 'text-slate-900 dark:text-white'),
    ('border-white/5', 'border-slate-200 dark:border-white/5'),
    ('border-white/10', 'border-slate-200 dark:border-white/10'),
    ('border-white/20', 'border-slate-300 dark:border-white/20'),
    ('text-slate-200', 'text-slate-800 dark:text-slate-200'),
    ('text-slate-300', 'text-slate-700 dark:text-slate-300'),
    ('text-slate-400', 'text-slate-500 dark:text-slate-400'),
    ('text-slate-500', 'text-slate-600 dark:text-slate-500')
]

for root, dirs, files in os.walk(directory):
    for file in files:
        if file.endswith('.tsx'):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            original_content = content

            for old, new in replacements:
                content = content.replace(old, new)

            # Fix specific cases where text-white should remain text-white (buttons with colored backgrounds)
            content = content.replace('bg-[#4F8CFF] text-slate-900 dark:text-white', 'bg-[#4F8CFF] text-white')
            content = content.replace('bg-emerald-500 text-slate-900 dark:text-white', 'bg-emerald-500 text-white')
            content = content.replace('bg-rose-500 text-slate-900 dark:text-white', 'bg-rose-500 text-white')
            content = content.replace('text-slate-900 dark:text-white shadow-lg border-0', 'text-white shadow-lg border-0')
            content = content.replace('hover:text-slate-900 dark:text-white', 'hover:text-slate-900 dark:hover:text-white')

            if content != original_content:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                  
