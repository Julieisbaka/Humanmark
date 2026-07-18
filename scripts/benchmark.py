from datasets import load_dataset

def load(dataset, task):
    ds = load_dataset(dataset, task)
    return ds

def parse(dataset):
    None

def save(dataset):
    None