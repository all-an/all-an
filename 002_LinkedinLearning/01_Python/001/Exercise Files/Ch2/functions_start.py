#
# Example file for working with functions
#
# define a basic function
def func1():
    print("I am a function")

func1()
print(func1())
func1
# function that takes arguments
def func2(arg1, arg2):
    print(arg1, " & ",arg2)


func2(59, 69)

# function that returns a value

def cube(x):
    return x * x * x
print(cube(59))
# function with default value for an argument
def power(num , x = 1):
    result = 1
    for i in range(x):
        result *= num
    return result

print(power(2))
print(power(2, 3))

print(power(x = 3, num = 2))

#function with variable number of arguments
def multi_add(*args): #any multiple arguments
    result = 0
    for item in args:
        result += item
    return result

print(multi_add(3, 4, 5, 4)) #multiple arguments