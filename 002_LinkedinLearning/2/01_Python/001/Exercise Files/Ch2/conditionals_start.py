#
# Example file for working with conditional statements
#


def main():
    x = input("Enter x number: ")
    y = input("Enter y number: ")

    # conditional flow uses if, elif, else
    if (x < y):
        st = "x less than y"
    elif (x == y):
        st = "x same as y"
    else:
        st = "x greater than y"
    
    print(st)
    # conditional statements let you use "a if C else b"


if __name__ == "__main__":
    main()
