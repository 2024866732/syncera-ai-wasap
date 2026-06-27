import json, subprocess, os, time

timestamp = time.strftime('%Y%m%d_%H%M%S')
backup_dir = os.path.expanduser('~/.hermes/whatsapp-bot/.backup')
os.makedirs(backup_dir, exist_ok=True)

# Step 1: Export current app settings as backup
result = subprocess.run(
    ['az', 'webapp', 'config', 'appsettings', 'list',
     '--resource-group', 'hafjet-bot-rg', '--name', 'hafjet-whatsapp-bot',
     '--output', 'json'],
    capture_output=True, text=True
)
settings = json.loads(result.stdout)

backup = os.path.join(backup_dir, f'app_settings_{timestamp}.json')
with open(backup, 'w') as f:
    json.dump(settings, f, indent=2, ensure_ascii=False)
print(f'Backed up {len(settings)} app settings to {backup}')

for s in settings:
    name = s.get('name', '')
    val = s.get('value', '')
    print(f'  {name:45} = {val[:60]}')

# Step 2: Get current app command line
result2 = subprocess.run(
    ['az', 'webapp', 'config', 'show',
     '--resource-group', 'hafjet-bot-rg', '--name', 'hafjet-whatsapp-bot',
     '--query', 'appCommandLine', '-o', 'tsv'],
    capture_output=True, text=True
)
print(f'\nCurrent appCommandLine: {result2.stdout.strip()}')

result3 = subprocess.run(
    ['az', 'webapp', 'config', 'show',
     '--resource-group', 'hafjet-bot-rg', '--name', 'hafjet-whatsapp-bot',
     '--query', 'linuxFxVersion', '-o', 'tsv'],
    capture_output=True, text=True
)
print(f'Current linuxFxVersion: {result3.stdout.strip()}')

result4 = subprocess.run(
    ['az', 'webapp', 'config', 'show',
     '--resource-group', 'hafjet-bot-rg', '--name', 'hafjet-whatsapp-bot',
     '--query', 'state', '-o', 'tsv'],
    capture_output=True, text=True
)
print(f'Current state: {result4.stdout.strip()}')
