#include <stdio.h>

#define TENTATIVAS 5

int main(){

	//  ==========                  ==========
	//  ========== 	     game       ==========
	//  ==========                  ==========
	
    int numerosecreto = 42;
    int chute; 
	
    printf("Hello world\n"); 

	for(int i = 1; i <= TENTATIVAS; i++){
		printf("Tentativa %d de %d\n", i, TENTATIVAS);
	    printf("Qual é o seu chute ? ");
	    scanf("%d", &chute);
	    printf("Seu chute foi %d\n", chute);

		int acertou = (chute == numerosecreto);
		int maior = chute > numerosecreto;
		int menor = chute < numerosecreto;

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
