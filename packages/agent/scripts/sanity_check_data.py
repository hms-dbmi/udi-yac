from datasets import load_from_disk, load_dataset

# data = load_from_disk('/n/netscratch/mzitnik_lab/Lab/dlange/data/dqvis_training')
data = load_from_disk('/n/holylfs06/LABS/mzitnik_lab/Users/dlange/data/dqvis_training_full')
dqvis = load_dataset("HIDIVE/DQVis")["train"]

def print_content(i, only_data = False):
    content = data['train'][i]['messages'][0]['content']
    query = data['train'][i]['messages'][1]['content']
    if only_data:
        content = content[135:-102]
    print(query)
    print(content)

# print_content(0)

def check_index(i):
    index = data['test'][i]['original_dqvis_index']
    dqvis_row = dqvis[index]
    dqvis_query = dqvis_row['query']
    print(index)
    print(dqvis_query)
    # print the query
    print(data['test'][i]['messages'][1]['content'])


print(check_index(0))
print(check_index(1))
print(check_index(2))
print(check_index(3))
print(check_index(4))
print(check_index(-1))
# for i in range(5):
#     print_content(i)



#   from datasets import load_from_disk, load_dataset
#   ft = load_from_disk("/path/to/dqvis_training_full")
#   dqvis = load_dataset("HIDIVE/DQVis")["train"]
#   # ft["train"][42]["original_dqvis_index"] → row in dqvis