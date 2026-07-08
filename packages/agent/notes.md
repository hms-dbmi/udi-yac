To run inference check scripts folder.
e.g. `sbatch ./scripts/vllm_a100.sbatch`

to run training

`export HF_TOKEN=generated_token_string`
`cd /n/home05/dlange/ARPAHAgent/alignment-handbook`
`sbatch llm4_r`

if h100 queue is long can use a100

```
salloc -p kempner --account=kempner_mzitnik_lab -c 16 --mem=200G --gres=gpu:1 -t 0-14:00 -C a100
```

My steps for running inference:

```
salloc -p kempner_h100 --account=kempner_mzitnik_lab -c 24 --mem=200G --gres=gpu:1 -t 0-14:00 -C h100
tmux new -s vllm
module load ncf/1.0.0-fasrc01
module load miniconda3/py39_4.11.0-linux_x64-ncf
conda activate udienv
vllm serve /n/netscratch/mzitnik_lab/Lab/dlange/data/vis-v2/data/hidive/UDI-VIS-Beta-v2-Llama-3.1-8B --gpu-memory-utilization 0.85 --port 8080 --host 127.0.0.1
vllm serve HIDIVE/UDI-VIS-Beta-v2-Llama-3.1-8B --gpu-memory-utilization 0.85 --port 8080 --host 127.0.0.1
vllm serve meta-llama/Llama-3.1-8B-Instruct --gpu-memory-utilization 0.85 --port 8080 --host 127.0.0.1
```

detach tmux: control b, d

new way, run on personal computer

Dev:
uv run fastapi dev ./src/udi_api.py --port 8007

Prod:
uv run fastapi run ./src/udi_api.py --port 8007

Old way, run on kempner

```
tmux new -s api
cd /n/home05/dlange/UDIAgent
module load ncf/1.0.0-fasrc01
module load miniconda3/py39_4.11.0-linux_x64-ncf
conda activate udienv
fastapi dev ./src/udi_api.py
```

detach tmux: control b, d

get hostname with `hostname`

open login node:

```
ssh -L 55001:localhost:8000 hostname
```

to check if session still goin;
squeue -u dlange

to rejoin a session (not sure if need -i)
srun --jobid=34215245 --pty bash -i

salloc -p kempner_h100 --account=kempner_mzitnik_lab -c 24 --mem=200G --gres=gpu:1 -t 0-23:00 -C h100
salloc -p kempner_requeue --account=kempner_mzitnik_lab -c 24 --mem=200G --gres=gpu:1 -t 0-23:00 -C h100
salloc -p kempner_requeue --account=kempner_mzitnik_lab -c 64 --mem=700G --gres=gpu:4 -t 0-23:00 -C h100
salloc -p kempner_h100 --account=kempner_mzitnik_lab -c 64 --mem=700G --gres=gpu:4 -t 2-23:00 -C h100

tmux new -s vllm
module load ncf/1.0.0-fasrc01
module load miniconda3/py39_4.11.0-linux_x64-ncf
conda activate udienv

vllm serve mims-harvard/TxAgent-T1-Llama-3.1-8B --gpu-memory-utilization 0.85 --port 8080 --host 127.0.0.1
vllm serve agenticx/UDI-VIS-Beta-v0-Llama-3.1-8B --gpu-memory-utilization 0.85 --port 8080 --host 127.0.0.1
vllm serve /n/netscratch/mzitnik_lab/Lab/dlange/data/vis-v1/data/agenticx/UDI-VIS-Beta-v1-Llama-3.1-8B_merged --gpu-memory-utilization 0.85 --port 8080 --host 127.0.0.1

vllm serve /n/netscratch/mzitnik_lab/Lab/dlange/data/vis-v2/data/agenticx/UDI-VIS-Beta-v2-Llama-3.1-8B_merged --gpu-memory-utilization 0.85 --port 8080 --host 127.0.0.1

Port forwarding in VsCode

in compute node:

- start server:

tmux new -s api
cd /n/home05/dlange/UDIAgent
module load ncf/1.0.0-fasrc01
module load miniconda3/py39_4.11.0-linux_x64-ncf
conda activate udienv

e.g. python3 -m http.server 8000 --bind 127.0.0.1x
or fastapi dev ./src/udi_api.py

in login node:

- forward compute to login

e.g. ssh -L <outgoing port>:localhost:<compute port> <cluster hostname>

- compute port: matches the outgoing port from the compute node
- the outgoing port matches what you will use locally to access
- note: if port is in use it will fail with "Could not request local forwarding.", try again with a diff port.
- the cluster hostname can be determined from `hostname` in the compute

ssh -L 55001:localhost:8000 holygpu8a19404.rc.fas.harvard.edu

In ports tab of vscode, add <outgoing port>, e.g. 55001

open localhost:9090 in browser.

Errors I've run into:

- https://github.com/vllm-project/vllm/issues/13815

To check queue if requesting resources is taking some time.

to check predicted start time of requested job:

scontrol show job <jobid> | grep StartTime

to get list of jobs in queue:
squeue --sort=-p -p kempner -t PD -o "%.18i %.8u %.2t %.10M %.10l %.4C %.10m %.20b %.8Q %.8P %R"
squeue --sort=-p -p kempner_h100 -t PD -o "%.18i %.8u %.2t %.10M %.10l %.4C %.10m %.20b %.8Q %.8P %R"
squeue --sort=-p -p kempner_requeue -t PD -o "%.18i %.8u %.2t %.10M %.10l %.4C %.10m %.20b %.8Q %.8P %R"

<!-- salloc I used to requeset resource for data transformation -->

salloc -p kempner --account=kempner_mzitnik_lab -c 16 --mem=700G --gres=gpu:2 -t 0-04:00 -C a100

- https://github.com/vllm-project/vllm/issues/13815

To run benchmark

uv run python ./src/benchmark.py
uv run python ./src/benchmark.py --no-orchestrator
