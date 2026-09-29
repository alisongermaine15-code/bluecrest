"""Run an explicit command file on the user-configured VPS, with verified host keys."""
import argparse
import base64
import hashlib
import pathlib
import socket
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRIVATE = ROOT / 'emergency-backups' / 'neon-export'
sys.path.insert(0, str(PRIVATE / '.ssh-tools'))
import paramiko

parser = argparse.ArgumentParser()
parser.add_argument('--command-file')
parser.add_argument('--show-host-key', action='store_true')
parser.add_argument('--trust-on-first-use', action='store_true')
args = parser.parse_args()
config = {}
for line in (PRIVATE / 'vps-ssh.private').read_text(encoding='utf-8-sig').splitlines():
    if '=' in line and not line.lstrip().startswith('#'):
        key, value = line.split('=', 1)
        config[key.strip()] = value.strip()
required = ['SSH_HOST', 'SSH_USER', 'SSH_PASSWORD']
if any(not config.get(key) for key in required):
    sys.exit('Missing SSH_HOST, SSH_USER or SSH_PASSWORD in the private credential file.')
if not args.command_file and not args.show_host_key and not args.trust_on_first_use:
    parser.error('--command-file is required unless a host-key action is used')

host = config['SSH_HOST']
port = int(config.get('SSH_PORT', '22'))
known_hosts = PRIVATE / 'vps-known-hosts.private'
host_key_name = host if port == 22 else f'[{host}]:{port}'

if args.show_host_key or args.trust_on_first_use:
    if known_hosts.exists():
        sys.exit(f'Host-key file already exists: {known_hosts}')
    sock = socket.create_connection((host, port), timeout=15)
    transport = paramiko.Transport(sock)
    try:
        transport.start_client(timeout=20)
        server_key = transport.get_remote_server_key()
        fingerprint = base64.b64encode(hashlib.sha256(server_key.asbytes()).digest()).decode().rstrip('=')
        if args.trust_on_first_use:
            keys = paramiko.HostKeys()
            keys.add(host_key_name, server_key.get_name(), server_key)
            keys.save(str(known_hosts))
            print(f'Pinned {server_key.get_name()} SHA256:{fingerprint}')
        else:
            print(f'{server_key.get_name()} SHA256:{fingerprint}')
    finally:
        transport.close()
    sys.exit(0)

client = paramiko.SSHClient()
if known_hosts.exists():
    client.load_host_keys(str(known_hosts))
else:
    client.load_system_host_keys(str(pathlib.Path.home() / '.ssh' / 'known_hosts'))
client.set_missing_host_key_policy(paramiko.RejectPolicy())
try:
    client.connect(host, port=port,
                   username=config['SSH_USER'], password=config['SSH_PASSWORD'],
                   look_for_keys=False, allow_agent=False, timeout=15,
                   auth_timeout=20, banner_timeout=20)
    command = pathlib.Path(args.command_file).read_text(encoding='utf-8-sig')
    stdin, stdout, stderr = client.exec_command(command, timeout=120)
    stdin.close()
    print(stdout.read().decode('utf-8', errors='replace'), end='')
    print(stderr.read().decode('utf-8', errors='replace'), end='', file=sys.stderr)
    sys.exit(stdout.channel.recv_exit_status())
finally:
    client.close()
