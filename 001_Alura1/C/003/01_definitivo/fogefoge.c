#include <stdio.h>
#include <stdlib.h>
#include <locale.h>
#include <conio.h>
#include "fogefoge.h"
#include "mapa.h"

//os arquivos tem de ser compilados juntos   >  gcc fogefoge.c mapa.c -o fogefoge.out
MAPA m; //declarou uma struct do tipo mapa de nome m , abaixo ele se refere a ela com m.

void cls(void) { 
	printf("\033[1J\033[H"); 
}

int acabou(){
	return 0;
}

int move(char direcao){
	int x;
	int y;
	
	for(int i = 0; i < m.linhas; i++){       //procura e d� posi��o ao jogador em linha
		for(int j = 0; j < m.colunas; j++){  //procura e d� a posi��o do jogador em coluna
			if(m.matriz[i][j] == '@') {
			x = i;  //nomeia a posi��o x do jogador com a vari�vel i
			y = j;  // idem s� que em y
			break;
			}
		}
	}
	
	switch(direcao) {
        case 'a':
            m.matriz[x][y-1] = '@';
            break;
        case 'w':
            m.matriz[x-1][y] = '@';
            break;
        case 's':
            m.matriz[x+1][y] = '@';
            break;
        case 'd':
            m.matriz[x][y+1] = '@';
            break;
    }

    m.matriz[x][y] = '.';
}

int main(){
    lemapa(&m); //&m passa o endere�o do ponteiro para a fun��o como par�metro 
    
    do{
    	system("cls");
		imprimemapa(&m);
	
		char comando;
    	scanf(" %c", &comando);
    	move(comando);
	
	}while(!acabou());

	
    liberamapa(&m);
	getch();
 }
