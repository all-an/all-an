def draw_block():
        screen.fill((30, 30, 30))
        screen.blit(block, (block_x, block_y))
        pygame.display.flip()