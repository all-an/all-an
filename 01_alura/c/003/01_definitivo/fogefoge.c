#include <stdio.h>
#include <stdlib.h>
#include <locale.h>
#include <conio.h>
#include "fogefoge.h"
#include "mapa.h"
#include <time.h>

//os arquivos tem de ser compilados juntos   >  gcc fogefoge.c mapa.c -o fogefoge
MAPA m; //declarou uma struct do tipo mapa de nome m , abaixo ele se refere a ela com m.
POSICAO heroi;

void cls(void) { 
	printf("\033[1J\033[H"); 
}

int praondefantasmavai(int xatual, int yatual, 
    int* xdestino, int* ydestino) {

    int opcoes[4][2] = { 
        { xatual   , yatual+1 }, 
        { xatual+1 , yatual   },  
        { xatual   , yatual-1 }, 
        { xatual-1 , yatual   }
    };

    srand(time(0));
    for(int i = 0; i < 10; i++) {
        int posicao = rand() % 4;

        if(ehvalida(&m, opcoes[posicao][0], opcoes[posicao][1]) &&
            ehVazia(&m, opcoes[posicao][0], opcoes[posicao][1])) {
            *xdestino = opcoes[posicao][0];
            *ydestino = opcoes[posicao][1];
            return 1;
        }
    }

    return 0;
}

void fantasmas() {
    MAPA copia;

    copiamapa(&copia, &m);

    for(int i = 0; i < copia.linhas; i++) {
        for(int j = 0; j < copia.colunas; j++) {
            if(copia.matriz[i][j] == FANTASMA) {

                int xdestino;
                int ydestino;

                int encontrou = praondefantasmavai(i, j, &xdestino, &ydestino);

                if(encontrou) {
                    andanomapa(&m, i, j, xdestino, ydestino);
                }
            }
        }
    }

    liberamapa(&copia);
}

int acabou(){
	return 0;
}

int ehdirecao(char direcao) {
    return
        direcao == ESQUERDA || 
        direcao == CIMA ||
        direcao == BAIXO ||
        direcao == DIREITA;
}

void move(char direcao){
	int x;
	int y;
	
	if(!ehdirecao(direcao))    
        return;
	
	int proximox = heroi.x;
    int proximoy = heroi.y;

	switch(direcao) {
        case ESQUERDA:
            proximoy--;
            break;
        case CIMA:
            proximox--;
            break;
        case BAIXO:
            proximox++;
            break;
        case DIREITA:
            proximoy++;
            break;
    }

	if(!ehvalida(&m, proximox, proximoy))
    	return;

	if(!ehVazia(&m, proximox, proximoy))
		return;

    andanomapa(&m, heroi.x, heroi.y, proximox, proximoy);
	heroi.x = proximox;
	heroi.y = proximoy;
}

int main(){
    lemapa(&m); //&m passa o endere�o do ponteiro para a fun��o como par�metro 
    encontramapa(&m, &heroi, HEROI);
    
    do{
    	system("cls");
		imprimemapa(&m);
	
		char comando;
		comando = _getch();
    	//scanf(" %c", &comando);
    	move(comando);
        fantasmas();
	
	}while(!acabou());

	
    liberamapa(&m);
	fflush(stdin);
 }
