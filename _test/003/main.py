import pygame
from sys import exit
from pygame.locals import *

class Game:
    def __int__(self):
        pygame.int()
        self.surface = pygame.display.set_mode((1000, 700))
        self.surface.fill((0, 0, 0))
    pass

def run():
    pass

def draw_block():
    surface.fill((0, 0, 0))
    surface.blit(block, (block_x, block_y))
    pygame.display.flip()

if __name__ == "__main__":
    game = Game()
    game.run()

    # opens up a window

    block = pygame.image.load("resourses/block.jpg").convert()
    block_x, block_y = 80, 80
    surface.blit(block, (block_x, block_y))

    pygame.display.flip()

    while True:
        move = 40
        for event in pygame.event.get():
            if event.type == KEYDOWN:
                if event.key == K_LEFT:
                    block_x -= move
                    draw_block()
                if event.key == K_RIGHT:
                    block_x += move
                    draw_block()
                if event.key == K_UP:
                    block_y -= move
                    draw_block()
                if event.key == K_DOWN:
                    block_y += move
                    draw_block()

            if event.type == pygame.QUIT:
                pygame.quit()
                exit()





