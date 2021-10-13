def withdraw_money(current_balance, amount):
    if(current_balance >= amount):
        current_balance = current_balance - amount
        return current_balance

balance = withdraw_money(100,80)

print(balance)
if(balance < 50):
    print("Make a deposit !")
else:
    print("Nothing to see here")

