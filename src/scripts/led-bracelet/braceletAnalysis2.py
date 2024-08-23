import numpy as np

# Input data
Green = np.array([10,55,88,156,189,245,255,255,255,255,255,239,194,149,104,59,14,30,75,132,176,210,255,221,154,109,64,19,26,71,127,172,205,249,192,148,114,58,13,21,77,111,156,212,255,255,255,255,255,255,217,172,127,82,37,8,64,109,154,210,255,221,176,143,87,42,3,37,82,149,194,239,226,192,136,80,35,10,43,99,156,200,245,255,255,255,255])  # Replace ... with the rest of the Green values
Blue = np.array([245,200,167,99,66,10,24,69,114,170,226,255,255,255,255,255,255,255,255,255,255,255,255,221,154,109,64,19,0,0,0,0,0,6,63,107,141,197,242,234,178,144,99,43,2,47,103,148,181,249,255,255,255,255,255,255,255,255,255,255,255,221,176,143,87,42,0,0,0,0,0,0,29,63,119,175,220,245,212,156,99,55,10,24,69,136,170])  # Replace ... with the rest of the Blue values
Unknown = np.array([160,157,242,54,23,95,85,85,85,85,85,85,85,85,85,85,85,75,30,209,229,135,170,170,170,170,170,170,170,170,170,170,170,170,170,170,170,170,170,191,231,197,54,126,85,85,85,85,85,85,85,85,85,85,85,93,21,56,207,135,170,170,170,170,170,170,170,170,170,170,170,170,170,170,170,170,170,160,129,201,54,98,95,85,85,85,85])  # Replace ... with the rest of the Unknown values


# Define functions for different mathematical operations
def average(Green, Blue):
    return (Green + Blue) / 2

def minimum(Green, Blue):
    return np.minimum(Green, Blue)

def maximum(Green, Blue):
    return np.maximum(Green, Blue)

def summation(Green, Blue):
    return Green + Blue

def bitwise_and(Green, Blue):
    return np.bitwise_and(Green, Blue)

def bitwise_or(Green, Blue):
    return np.bitwise_or(Green, Blue)

def bitwise_xor(Green, Blue):
    return np.bitwise_xor(Green, Blue)

# List of candidate functions
candidate_functions = [average, minimum, maximum, summation, bitwise_and, bitwise_or, bitwise_xor]

# Evaluate each candidate function
for func in candidate_functions:
    # Calculate Unknown values using the candidate function
    predicted_unknown = func(Green, Blue)
    
    # Evaluate the performance of the candidate function (e.g., using mean squared error)
    mse = np.mean((predicted_unknown - Unknown) ** 2)
    
    # Print the mean squared error for the candidate function
    print(f"{func.__name__}: Mean Squared Error = {mse}")

# Choose the candidate function with the lowest mean squared error as the final model
