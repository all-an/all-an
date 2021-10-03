import pygame
import pygame.freetype
from pygame.locals import *

import ctypes
user32 = ctypes.WinDLL('user32')
SW_MAXIMISE = 3
SW_SHOWNORMAL = 1

def main():

    def draw_block():
        screen.fill((30, 30, 30))
        screen.blit(block, (block_x, block_y))
        pygame.display.flip()

    pygame.init()
    flags = pygame.FULLSCREEN
    screen = pygame.display.set_mode((0, 0), flags)
    hWnd = user32.GetForegroundWindow()
    orgsize = None 

    # clock = pygame.time.Clock()

    min = pygame.Rect((0, 16, 32, 32))
    max = pygame.Rect((0, 16, 32, 32))
    close = pygame.Rect((0, 16, 32, 32))

    min.right = screen.get_rect().right - 50
    max.right = screen.get_rect().right + 100  # hiding the maximize button
    close.right = screen.get_rect().right - 10

    font = pygame.freetype.SysFont(None, 32)
    font.origin = True
    while True:
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                return

            if event.type == pygame.VIDEORESIZE:
                screen = pygame.display.set_mode((event.w, event.h), flags)
                min.right = screen.get_rect().right - 90
                max.right = screen.get_rect().right - 50
                close.right = screen.get_rect().right - 10
            if event.type == pygame.MOUSEBUTTONDOWN:
                pos = pygame.mouse.get_pos()
                if close.collidepoint(pos):
                    return
                if min.collidepoint(pos):
                    pygame.display.iconify()
                
                if max.collidepoint(pos):
                    if not orgsize:
                        orgsize = screen.get_rect().size
                        user32.ShowWindow(hWnd, SW_MAXIMISE)
                    else:
                        user32.ShowWindow(hWnd, SW_SHOWNORMAL)
                        screen = pygame.display.set_mode(orgsize, flags)
                        orgsize = None
                
        screen.fill((30, 30, 30))
        pygame.draw.rect(screen, pygame.Color('dodgerblue'), max)
        pygame.draw.rect(screen, pygame.Color('darkorange'), min)
        pygame.draw.rect(screen, pygame.Color('red'), close)
        font.render_to(screen, min.move(7, -10).bottomleft, '_')
        font.render_to(screen, max.move(4, -5).bottomleft, 'O')
        font.render_to(screen, close.move(4, -5).bottomleft, 'X')

        block = pygame.image.load("resourses/block.jpg").convert()

        block_x = 100
        block_y = 100

        screen.blit(block, (block_x, block_y))  

        pygame.display.update()
        # clock.tick(60)

if __name__ == '__main__':
    main()
    pygame.quit()

