"""
import random

city_random = random.randrange(1, 3)

def favorite_cities(city):
    if city == 1:
        print("One of my favorite cities is Palhoça")
    if city == 2:
        print("One of my favorite cities is Floripa")

favorite_cities(city_random)
"""

print("Course solution")

def favorite_cities(name):
    print("One of my favite cities is {}." .format(name))

favorite_cities("Floripa")
favorite_cities("São José")
favorite_cities("Palhoça")

