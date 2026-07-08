import json
import os
import sys
import pandas as pd
import numpy as np
from datasets import load_dataset, Dataset, DatasetDict, load_from_disk
from huggingface_hub import HfApi, HfFolder, hf_hub_download
import copy
import random

def load_dqvis():

    dataset = load_dataset(f"HIDIVE/DQVis")
    df = dataset['train'].to_pandas()
    # size: (1075190, 15)
    # print(df.shape)
    # df = subsample(df, group_size=25)
    print(df.shape)

    # exit(0)

    # download the dataset schema list
    dataset_schemas = hf_hub_download(
        repo_id="HIDIVE/DQVis",
        filename="dataset_schema_list.json",
        repo_type="dataset"
    )
    dataset_schemas = json.load(open(dataset_schemas, 'r'))

    # omit fields we don't need in training
    for schema in dataset_schemas:
        for resource in schema['resources']:
            schema = resource['schema']
            for field in schema['fields']:
                del field['udi:overlapping_fields']

    # download the grammar schema
    grammar_schema = hf_hub_download(
        repo_id="HIDIVE/DQVis",
        filename="UDIGrammarSchema.json",
        repo_type="dataset"
    )
    grammar_schema = json.load(open(grammar_schema, 'r'))

    format_for_finetuning(
        df,
        dataset_schemas,
        grammar_schema,
        # output_path='/n/netscratch/mzitnik_lab/Lab/dlange/data/dqvis_training_full',
        output_path='/n/holylfs06/LABS/mzitnik_lab/Users/dlange/data/dqvis_training_full',
        huggingface_path='',
        push_to_hub=False,
        pretty=False
    )

def subsample(df, group_size=25):
    ''' get one sample out of every group of size group_size rows. '''
   
    # Create group IDs: e.g. 0 for rows 0-24, 1 for rows 25-49, etc.
    group_ids = np.arange(len(df)) // group_size

    # Group by these IDs and sample one row per group
    sampled_df = df.groupby(group_ids).apply(lambda g: g.sample(1, random_state=2324644)).reset_index(drop=True)

    return sampled_df

def display_progress(df, index):
    total_rows = len(df)
    progress = (index / total_rows) * 100
    bar_length = 30
    filled_length = int(bar_length * index // total_rows)
    bar = '=' * filled_length + '-' * (bar_length - filled_length)
    sys.stdout.write(f"\rFormat For fintuning row {index}/{total_rows} [{bar}] {progress:.2f}%")
    sys.stdout.flush()

def format_for_finetuning(df, dataset_schema_list, grammar_schema, output_path, huggingface_path, push_to_hub=False, pretty=False):
    """
    converts the input data frame with expected columnms:
        query - the user query
        spec - the UDI Grammar Specification
        dataset_schema - the key of the relevant dataset schema
    Into a list of "converstions" each conversation is a list of objects with the following keys:
        content - text typed by user/assistant or sent to chatbot
        role - user | assistant | system
        tool_calls - null | list of tool calls
        tools - list of tools available, typically provided in the first point in the conversation,
                and in follow ups it will be null 
    """
    print('converting to finetuning format')
    print(dataset_schema_list)
    dataset_schema_map = {schema["udi:name"]: schema for schema in dataset_schema_list}
    # for each row in the data frame, create a conversation that consists of three messages
    # 1. system prompt, 2. user query, 3. assistant response
    conversations = []
    index = 0
    # max_chunk_size = 50000
    # chunk = 0
    for _, row in df.iterrows():
        display_progress(df, index)
        index += 1
        dataset_schema = dataset_schema_map[row["dataset_schema"]]
        reduced_dataset_schema = get_reduced_dataset_schema(dataset_schema, row)
        system_prompt = create_system_prompt(reduced_dataset_schema, grammar_schema)
        user_query = create_user_query(row["query"])
        assistant_response = create_assistant_response(row["spec"], grammar_schema)
        conversations.append([system_prompt, user_query, assistant_response])

    # split converstations into train and test sets
    # train_size = len(conversations) - 10
    # train_conversations = conversations[:train_size]
    # test_conversations = conversations[train_size:]
    train_conversations, test_conversations, train_indices, test_indices = train_test_split(conversations, group_size=25)
    print(f"train conversations: {len(train_conversations)}, test conversations: {len(test_conversations)}")
    save_huggingface_dataset(new_dataset=train_conversations, test_dataset=test_conversations, train_indices=train_indices, test_indices=test_indices, dataset_path=output_path, push_to_hub=push_to_hub)

    return


def train_test_split(conversations, group_size=25):
    '''
    First pull out one for every group of size group_size to create the test set, and use the rest for training.
    Next, shuffle the order of the training set conversations to ensure a good mix of examples.
    Returns (train_conversations, test_conversations, train_indices, test_indices)
    where indices are the original DQVis row positions.
    '''
    # Create group IDs: e.g. 0 for rows 0-24, 1 for rows 25-49, etc.
    group_ids = np.arange(len(conversations)) // group_size

    # Randomly select one index per group for the test set
    test_idx_set = set()
    for group_id in np.unique(group_ids):
        # Get all indices in this group
        group_mask = group_ids == group_id
        group_indices = np.where(group_mask)[0]
        # Randomly select one index from this group
        test_idx_set.add(np.random.choice(group_indices))

    # Split into train and test based on selected indices
    test_indices = sorted(test_idx_set)
    test_conversations = [conversations[i] for i in test_indices]
    train_indices = [i for i in range(len(conversations)) if i not in test_idx_set]
    train_conversations = [conversations[i] for i in train_indices]

    # Shuffle training conversations and their indices together
    combined = list(zip(train_conversations, train_indices))
    random.shuffle(combined)
    train_conversations, train_indices = zip(*combined)
    train_conversations = list(train_conversations)
    train_indices = list(train_indices)

    return train_conversations, test_conversations, train_indices, test_indices

def get_reduced_dataset_schema(full_schema, row, entity_reduction_rate=0.25, field_reduction_rate=0.1):
    """
    Reduces the dataset schema to only include fields that are present in the row.
    This is done to avoid including fields that are not relevant to the current query
    and reduce the size of the schema for finetuning.
    """
    solution = row["solution"]
    if type(solution) is str:
        solution = json.loads(solution)

    # extract entities from solution
    entities = [v['entity'] for k,v in solution.items() if 'fields' in v]

    # extract fields from solution
    fields = [v['name'] for k,v in solution.items() if 'fields' not in v]

    reduced_schema = copy.deepcopy(full_schema)


    random.seed(89827565154)
    # reduce entities
    reduced_resources = []
    for resource in reduced_schema['resources']:
        if resource['name'] in entities or random.random() < entity_reduction_rate:
            reduced_resources.append(resource)
    reduced_schema['resources'] = reduced_resources

    # reduce fields for each remaining entity
    for resource in reduced_schema['resources']:
        schema = resource['schema']
        reduced_fields = []
        for field in resource['schema']['fields']:
            if field['name'] in fields or random.random() < field_reduction_rate:
                reduced_fields.append(field)
        resource['schema']['fields'] = reduced_fields

    return reduced_schema

def create_system_prompt(dataset_schema, grammar_schema):
    dataset_schema_string = json.dumps(dataset_schema, indent=0)
    return {
        "content": f"You are a helpful assistant that will explore, and analyze datasets with visualizations. The following defines the available datasets:\n{dataset_schema_string}\n Typically, your actions will use the provided functions. You have access to the following functions.",
        "role": "system",
        "tool_calls": json.dumps(None),
        "tools": json.dumps([
            {
                "name": "RenderVisualization",
                "description": "Render a visualization with a provided visualization grammar of graphics style specification.",
                "parameter": {
                    "type": "object",
                    "properties": {
                        "spec": {
                            "type": "object",
                            "description": "The UDI Grammar Specification for the visualization.",
                            "required": True,
                            "properties": grammar_schema
                        }
                    }
                }
            }
        ])
    }


def create_user_query(query):
    return {
        "content": query,
        "role": "user",
        "tool_calls": json.dumps(None),
        "tools": json.dumps(None)
    }

def create_assistant_response(spec, grammar_schema):
    return {
        "content": "",
        "role": "assistant",
        "tool_calls": json.dumps([
            {
                "name": "RenderVisualization",
                "arguments": {
                    "spec": spec
                }
            }
        ]),
        "tools": json.dumps(None)
    }

def save_huggingface_dataset(dataset_path, new_dataset=None, test_dataset=None, train_indices=None, test_indices=None, push_to_hub=False):
    """
    Save the dataset in a format recognized by Hugging Face's datasets library.

    Args:
        new_dataset (list): List of training examples.
        test_dataset (list): List of test examples.
        train_indices (list): Original DQVis row indices for training examples.
        test_indices (list): Original DQVis row indices for test examples.
        dataset_path (str): Path to save the dataset.
    """
    print()
    print("saving to huggingface format")
    os.makedirs(dataset_path, exist_ok=True)

    if new_dataset is not None:
        print("creating train dataset")
        train_path = os.path.join(dataset_path, "train")
        os.makedirs(train_path, exist_ok=True)
        train_data = {"messages": new_dataset}
        if train_indices is not None:
            train_data["original_dqvis_index"] = train_indices
        train_dataset = Dataset.from_dict(train_data)
        print("done")
        train_dataset.save_to_disk(train_path)

    if test_dataset is not None:
        test_path = os.path.join(dataset_path, "test")
        os.makedirs(test_path, exist_ok=True)
        test_data = {"messages": test_dataset}
        if test_indices is not None:
            test_data["original_dqvis_index"] = test_indices
        test_dataset = Dataset.from_dict(test_data)
        test_dataset.save_to_disk(test_path)

    print('creating dataset_dict')
    # Save a dataset_dict file for metadata
    if new_dataset is not None and test_dataset is not None:
        dataset_dict = DatasetDict(
            {"train": train_dataset, "test": test_dataset})
    elif new_dataset is not None and test_dataset is None:
        dataset_dict = DatasetDict({"train": train_dataset})
    elif new_dataset is None and test_dataset is not None:
        dataset_dict = DatasetDict({"test": test_dataset})
    print('writing dataset_dict')
    dataset_dict.save_to_disk(dataset_path) 
    print('done')
    if push_to_hub:
        print('Not implemented, skipping upload to huggingface hub')
        # api = HfApi()
        # api.upload_folder(folder_path=dataset_path, repo_id=f"agenticx/UDI-VIS-{chunk}", repo_type="dataset")
        # print('DONE')




if __name__ == "__main__":
    load_dqvis()