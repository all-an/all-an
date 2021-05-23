#include <stdio.h>

//  ==========                 ==========
//  ========== 	     game	   ==========
//  ==========                 ==========

int main(){
    int numerosecreto = 42;
    printf("Hello world\n");

    int chute;

	for(int i = 1; i <= 3; i++){
		printf("Tentativa %d de 3\n", i);
	    printf("Qual é o seu chute ? ");
	    scanf("%d", &chute);
	    printf("Seu chute foi %d\n", chute);

		int acertou = (chute == numerosecreto);

		if(acertou){
			printf("Você acertou!\n");
			printf("Você joga bem!\n");
			break;
		}
		else{

			int maior = chute > numerosecreto;
			if(maior){
				printf("Chute maior.\n");
			}else{
				printf("Chute menor.\n");	
			}
			printf("Você errou!\n");	
		} 

	}
	printf("Fim de jogo !\n");
}