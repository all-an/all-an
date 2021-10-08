#include <stdio.h>
#include <stdlib.h>
#include <locale.h>
#include <conio.h>
#include "copiafogefoge.h"
#include "copiamapa.h"

//os arquivos tem de ser compilados juntos   >  gcc copiafogefoge.c copiamapa.c -o copiafogefoge
MAPA m; //declarou uma struct do tipo mapa de nome m , abaixo ele se refere a ela com m.
POSICAO heroi;

void cls(void) { 
	printf("\033[1J\033[H"); 
}

int acabou(){
	return 0;
}

int ehdirecao(char direcao) {
    return
        direcao == 'a' || 
        direcao == 'w' ||
        direcao == 's' ||
        direcao == 'd';
}

void move(char direcao){
	int x;
	int y;
	
	if(!ehdirecao(direcao))    
        return;
	
	int proximox = heroi.x;
    int proximoy = heroi.y;

	switch(direcao) {
        case 'a':
            proximoy--;
            break;
        case 'w':
            proximox--;
            break;
        case 's':
            proximox++;
            break;
        case 'd':
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
    encontramapa(&m, &heroi, '@');
    
    do{
    	system("cls");
		imprimemapa(&m);
	
		char comando;
		comando = _getch();
    	//scanf(" %c", &comando);
    	move(comando);
	
	}while(!acabou());

	
    liberamapa(&m);
	getch();
 }
