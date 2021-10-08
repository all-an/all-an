# import turtle
import turtle
  
# initialise turtle instance
stars = turtle.Turtle()
  
# increases the speed of turtle
stars.speed(30)
  
# to change the background color
stars.getscreen().bgcolor("black")
stars.color("yellow")
  
# stop drawing
stars.penup()
  
# move the turtle
stars.goto((-200, 50))
  
# start drawing
stars.pendown()
  
# function to draw stars
def star(turtle, size):
    if size <= 4:
        return
    else:
        for i in range(2):
            
            # moving turtle forward
            turtle.forward(size)
            star(turtle, size/2)
  
            # moving turtle left
            turtle.left(216/2)
  
  
# calling the star function
star(stars, 90)
turtle.done()